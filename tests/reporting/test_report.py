import json
import runpy
from pathlib import Path
from zipfile import ZipFile
import pytest
from beivymate.reporting.report import ReportService
from beivymate.model.artifact.requirement_understanding import UnderstandingArtifact
from beivymate.model.artifact.test_analysis import AnalysisArtifact
from beivymate.model.artifact.test_design import DesignArtifact
from beivymate.model.artifact.test_execution import ExecutionArtifact
from beivymate.runtime.llm.gateway import LLMGateway
from beivymate.runtime.llm.models import LLMResponse

ROOT=Path(__file__).resolve().parents[2]


class Provider:
    def chat(self,request):
        return LLMResponse(model='synthetic',content=json.dumps(dict(requirement_conformance='模拟验证了支付用例，不能证明需求完整实现',
            customer_impact='存在历史失败，关闭状态未知',risks=['未配置准入标准'],recommendation='建议发布',rationale='仅供评估'),ensure_ascii=False))


def test_report_after_three_rounds(tmp_path):
    runpy.run_path(str(ROOT/'tests/execution/test_full_pipeline.py'))['test_full_pipeline_three_rounds'](tmp_path)
    def read(cls,name):return cls.model_validate_json((tmp_path/name).read_text())
    u=read(UnderstandingArtifact,'requirement_understand.json');a=read(AnalysisArtifact,'analysis.json');d=read(DesignArtifact,'design.json')
    rounds=[read(ExecutionArtifact,f'execution-round-{n}.json') for n in (1,2,3)]
    service=ReportService(LLMGateway(Provider()),'synthetic',ROOT/'resources/skills/tester/test_report/templates/zh-CN/DefaultBriefTestReportTemplate.docx')
    report=service.generate(u,a,d,rounds,simulation=True)
    assert report.facts['counts']=={'pass':3,'failed':0,'blocked':0,'not_run':0}
    assert len(report.facts['attempt_history'])==9
    assert len(report.facts['defects'])==1
    assert report.assessment.recommendation=='无法评估'
    path=service.export(report,tmp_path/'reports')
    with ZipFile(path/'report.docx') as doc:
        text=doc.read('word/document.xml').decode()
        assert '模拟验证报告' in text and 'Bug-00001' in text
        assert 'Bug-1024' not in text and 'iPhone 15' not in text and '98%' not in text
    with pytest.raises(FileExistsError):service.export(report,tmp_path/'reports')
    partial=service.generate(u,a,d,rounds[:1])
    assert partial.facts['counts']['blocked']==1 and partial.assessment.recommendation=='无法评估'
    changed=rounds[0].model_copy(deep=True);changed.plan.items[0].product_version='wrong'
    with pytest.raises(ValueError,match='version'):service.generate(u,a,d,[changed])

    from beivymate.agent.tester.skills.test_report import TestReportSkill
    from beivymate.runtime.context import AgentContext
    from beivymate.runtime.checkpoint import digest
    context=AgentContext();context.set('task_id',d.task_id);context.set('step_id','report')
    inputs={'u':u,'a':a,'d':d,**{str(n):r for n,r in enumerate(rounds)}}
    context.set('step_inputs',inputs)
    context.set('accepted_artifact_hashes',{x.id:digest(x) for x in inputs.values()})
    context.set('simulation',True);context.set('report_output_directory',str(tmp_path/'skill-reports'))
    skill=TestReportSkill(service);skill.execute(context);skill.validate_acceptance(context)
    restored=AgentContext.restore(context.snapshot()).get('test_report_artifact')
    assert restored.release_decision=='pending_human'
    context.set('accepted_artifact_hashes',{})
    with pytest.raises(ValueError,match='accepted'):skill.execute(context)
    # A company-specific report workflow uses accepted historical execution only.
    from beivymate.application.composition import create_tester_agent
    from beivymate.model.entity.requirement import Requirement
    (tmp_path/'historical.md').write_text('---\nid: inputs.previous_execution\ncheckpoint: execution-checkpoint-3.json\nsource_key: steps.execute.test_execution\n---\n')
    flow=tmp_path/'company-process.md'
    flow.write_text('---\nid: company-process\nname: 公司自定义过程\nimports:\n  - historical.md\n---\n\n## 步骤：delivery_summary\n- 技能：test_report\n- 输入：inputs.previous_execution\n- 执行授权：auto\n- 结果确认：manual\n')
    agent=create_tester_agent(str(flow),LLMGateway(Provider()),'synthetic',template_path='does-not-exist.md')
    c=AgentContext();c.set('simulation',True);c.set('report_output_directory',str(tmp_path/'independent'))
    state=agent.start(None,tmp_path/'independent-run.json',task_id=d.task_id,context=c)
    result=AgentContext.restore(state.context).get('test_report_artifact')
    assert result.facts['requirement_scope'] is None
    assert result.assessment.recommendation=='无法评估'
    assert any('本流程未提供' in x for x in result.limitations)
    (tmp_path/'historical.md').unlink()  # Resume must not reload changed/missing import files.
    state=agent.resume(tmp_path/'independent-run.json',decision='approved',actor='reviewer',expected_subject_hash=state.subject_hash)
    assert state.status=='completed'
    assert report.model_assessment.recommendation=='建议发布'
    assert report.assessment.recommendation=='无法评估'
    assert report.assessment.rationale!=report.model_assessment.rationale
    assert report.facts['attempt_history'][0]['observations']
    assert 'design_questions' in report.facts
    revised=service.generate(u,a,d,rounds,simulation=True,previous=report)
    assert revised.series_id==report.series_id and revised.revision==2 and revised.previous_report_id==report.id
    modified=rounds[0].model_copy(deep=True)
    modified.plan.items[0].case.steps[0].expected_result='tampered'
    with pytest.raises(ValueError,match='content'):service.generate(u,a,d,[modified])
    from xml.etree import ElementTree as ET
    with ZipFile(path/'report.docx') as doc:
        ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        body=ET.fromstring(doc.read('word/document.xml')).find('w:body',ns)
        table_index=next(i for i,n in enumerate(body) if n.tag.endswith('}tbl'))
        defect_index=next(i for i,n in enumerate(body) if ''.join(n.itertext()).startswith('4. 缺陷分析'))
        assert table_index<defect_index
        assert body.findall('.//w:pStyle',ns)
    class NoCalls:
        def chat(self,request):raise AssertionError('Model should not be called')
    invalid=ReportService(NoCalls(),'test',tmp_path/'missing.docx')
    with pytest.raises(FileNotFoundError):invalid.generate(u,a,d,rounds)
    duplicate=rounds[0].model_copy(deep=True)
    duplicate.plan.items.append(duplicate.plan.items[0].model_copy(deep=True))
    with pytest.raises(ValueError,match='Duplicate execution'):service.generate(u,a,d,[duplicate])
    dated=rounds[0].model_copy(deep=True)
    dated.attempts[0].started_at='2026-09-14T10:00:00+08:00'
    dated.attempts[0].ended_at='2026-09-14T03:00:00+00:00'
    dated_report=service.generate(u,a,d,[dated],simulation=True)
    assert all(t.endswith('+00:00') for t in dated_report.facts['period'])
    # Real Runtime handoff of all five stages, with three accepted execution rounds.
    bindings=[('understanding','design-checkpoint.json','steps.understand.requirement_understanding'),
              ('analysis','design-checkpoint.json','steps.analyze.test_analysis'),
              ('design','design-checkpoint.json','steps.design.test_design')]
    bindings += [(f'execution_{n}',f'execution-checkpoint-{n}.json','steps.execute.test_execution') for n in (1,2,3)]
    for name,checkpoint,key in bindings:
        (tmp_path/f'import-{name}.md').write_text(f'---\nid: inputs.{name}\ncheckpoint: {checkpoint}\nsource_key: {key}\n---\n')
    flow=tmp_path/'complete-report-workflow.md'
    flow.write_text('---\nid: complete-report\nname: 五阶段离线验证\nimports:\n'+
        ''.join(f'  - import-{name}.md\n' for name,_,_ in bindings)+'---\n\n## 步骤：final_report\n- 技能：test_report\n- 输入：'+'、'.join(f'inputs.{name}' for name,_,_ in bindings)+'\n- 执行授权：auto\n- 结果确认：manual\n')
    agent=create_tester_agent(str(flow),LLMGateway(Provider()),'synthetic')
    c=AgentContext();c.set('simulation',True);c.set('task_output_directory',str(tmp_path/'final-reports'))
    state=agent.start(None,tmp_path/'final-report-checkpoint.json',task_id=d.task_id,context=c)
    assert state.status=='waiting_review'
    output=AgentContext.restore(state.context)
    assert Path(output.get('test_report_directory')).is_relative_to(tmp_path/'final-reports')
    final=output.get('test_report_artifact')
    from beivymate.documents.runtime import store_for,owner_for
    from beivymate.documents.models import DocumentRef
    refs=output.get('document_outputs')['final_report']
    assert set(refs)=={'test_report','test_report_data','test_report_word'}
    documents=store_for(output)
    assert documents.read(owner_for(output),DocumentRef.model_validate(refs['test_report_word']))==(Path(output.get('test_report_directory'))/'report.docx').read_bytes()
    assert all(item['origin']['rounds']==[1,2,3] for item in documents.list(owner_for(output)) if item['ref']['id'] in {r['id'] for r in refs.values()})

    assert final.facts['rounds']==[1,2,3] and final.facts['counts']['pass']==3
    assert final.facts['defects'][0]['verifications'][0]['result']=='pass'
    state=agent.resume(tmp_path/'final-report-checkpoint.json',decision='approved',actor='synthetic-reviewer',
        comment='模拟串联技术确认，不是产品发布批准',expected_subject_hash=state.subject_hash)
    assert state.status=='completed'
    (tmp_path/'five-stage-summary.json').write_text(json.dumps({'simulation':True,'real_model_calls':0,
        'status':state.status,'execution_rounds':3,'final_counts':final.facts['counts'],
        'defect_count':len(final.facts['defects']),'report_directory':output.get('test_report_directory'),
        'release_decision':final.release_decision},ensure_ascii=False,indent=2))
