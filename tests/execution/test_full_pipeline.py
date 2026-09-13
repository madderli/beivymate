"""Synthetic four-stage contract validation; no model or product execution."""
import json
from pathlib import Path
from openpyxl import load_workbook
from beivymate.application.composition import create_tester_agent
from beivymate.assets.cases import CaseStore
from beivymate.execution.service import ExecutionService
from beivymate.model.artifact.requirement_understanding import UnderstandingData
from beivymate.model.artifact.test_analysis import AnalysisData
from beivymate.model.artifact.test_design import ProductCatalog
from beivymate.model.artifact.test_execution import StepObservation
from beivymate.model.entity.requirement import Requirement
from beivymate.runtime.context import AgentContext
from beivymate.runtime.llm.gateway import LLMGateway
from beivymate.runtime.llm.models import LLMResponse

ROOT=Path(__file__).resolve().parents[2]


class SyntheticProvider:
    def __init__(self): self.calls=0
    def chat(self,request):
        self.calls+=1
        if self.calls<3:
            cls=UnderstandingData if self.calls==1 else AnalysisData
            data={n:{'status':'not_provided','reason':'离线模拟未提供'} for n in cls.model_fields if n!='unknowns'}
            data['objective_scope' if self.calls==1 else 'test_conditions']={'status':'provided','items':[
                {'text':t,'basis':'explicit','source_refs':['requirement:R']} for t in ('支付成功更新状态','支付失败提示并保持状态','成功生成流水号')]}
            data['unknowns']=[]
        else:
            payload=json.loads(request.messages[1].content)
            data={'cases':[{'title':condition['text'],'description':'离线模拟用例','preconditions':'模拟订单存在','priority':'P1',
                'steps':[{'description':'模拟触发场景','expected_result':'操作完成'},
                         {'description':'模拟核对结果','expected_result':condition['text']}],
                'product_id':'payment','project_id':'demo','function_id':'pay','applicable_versions':['1'],
                'condition_refs':[ref],'change_reason':'模拟覆盖'} for ref,condition in payload['conditions'].items()],
                'uncovered':[],'summary':'离线模拟：3 个用例，非真实模型生成'}
        return LLMResponse(model='synthetic',content=json.dumps(data,ensure_ascii=False))


def test_full_pipeline_three_rounds(tmp_path):
    provider=SyntheticProvider()
    catalog=ProductCatalog(products={'payment':'Func01'},functions=[{'id':'pay','product_id':'payment','name':'支付'}])
    store=CaseStore(tmp_path/'cases.db',catalog)
    agent=create_tester_agent(str(ROOT/'resources/configuration/workflow/m7_test_design.md'),LLMGateway(provider),'synthetic',design_store=store)
    requirement=Requirement(id='R',title='支付需求（离线模拟）',content='支付成功更新状态并生成流水号；失败提示并保持状态。')
    (tmp_path/'requirement.md').write_text(requirement.content)
    context=AgentContext()
    for key,value in {'actor':'synthetic-author','maintainer':'synthetic-owner','project_id':'demo',
        'target_versions':{'payment':'1'},'design_output_directory':str(tmp_path)}.items():context.set(key,value)
    checkpoint=tmp_path/'design-checkpoint.json'
    state=agent.start(requirement,checkpoint,task_id='SIMULATED',context=context)
    for key,name in [('tester_requirement_understanding_artifact','understanding'),('test_analysis_artifact','analysis'),('test_design_artifact','design')]:
        artifact=AgentContext.restore(state.context).get(key)
        (tmp_path/(name+'.json')).write_text(artifact.model_dump_json(indent=2))
        (tmp_path/(name+'.md')).write_text(artifact.markdown)
        state=agent.resume(checkpoint,decision='approved',actor='synthetic-reviewer',
            comment='离线串联技术确认，不代表业务批准',expected_subject_hash=state.subject_hash)
    assert state.status=='completed' and provider.calls==3
    design=artifact
    service=ExecutionService(tmp_path/'execution','SIMULATED')
    plan=service.from_design(design,store,environment='SIMULATED-ENV',versions={'payment':'1'},executor='synthetic-executor')
    plan.defect_mode='auto'
    matrix=[['failed','blocked','pass'],['failed','pass','pass'],['pass','pass','pass']]
    for number,results in enumerate(matrix,1):
        service.start_round(plan)
        for index,(item,result) in enumerate(zip(plan.items,results)):
            attempt=service.begin(number,item.id,executor='synthetic-executor')
            service.record_step(number,attempt.id,StepObservation(step=1,actual='模拟操作完成',result='pass'))
            if number==2 and index==1:
                service.pause_or_resume(number,attempt.id)
                service=ExecutionService(tmp_path/'execution','SIMULATED')
                service.pause_or_resume(number,attempt.id,resume=True,state_verified=True)
            service.record_step(number,attempt.id,StepObservation(step=2,actual='模拟结果：'+result,result=result),
                defect_number=1 if number==2 and index==0 else None)
            if number==3 and index==0:
                service.record_defect_verification(1,number,attempt.id,actor='synthetic-reviewer')
                service.record_defect_verification(1,number,attempt.id,actor='synthetic-reviewer')
        finished=service.finish(number)
        assert all(Path(path).exists() for path in finished.deliverables.values())
        (tmp_path/f'execution-round-{number}.json').write_text(finished.model_dump_json(indent=2))
        workflow=ROOT/'resources/configuration/workflow/m8_test_execution.md'
        if number==3:
            (tmp_path/'auto-execute.md').write_text('---\nid: execute\nskill: test_execution\nauthorization_mode: auto\nreview_mode: auto\n---\n')
            workflow=tmp_path/'auto-workflow.md'
            workflow.write_text('---\nid: simulated-auto\nname: 模拟自动确认\nsteps:\n  - auto-execute.md\n---\n')
        execution_agent=create_tester_agent(str(workflow),None,'synthetic',execution_service=service)
        context=AgentContext();context.set('execution_round_number',number)
        path=tmp_path/f'execution-checkpoint-{number}.json'
        state=execution_agent.start(requirement,path,task_id='SIMULATED',context=context)
        if number<3:
            state=execution_agent.resume(path,decision='approved',actor='synthetic-reviewer',expected_subject_hash=state.subject_hash)
        else:
            assert any(d.phase=='review' and d.mode=='auto' for d in state.decisions)
        delivered=AgentContext.restore(state.context).get('test_execution_artifact')
        assert delivered.completed and delivered.deliverables
        if number==3:
            assert delivered.defects[0].verifications[0].result=='pass'
        assert state.status=='completed'
    report=json.loads((tmp_path/'execution/execution-results.json').read_text())
    assert len(report['rounds'])==3 and all(r['completed'] for r in report['rounds'])
    assert len(report['defects'])==1 and report['defects'][0]['rounds']==[1,2,3]
    assert len(report['defects'][0]['verifications'])==1
    assert report['defects'][0]['status']=='registered'
    assert service.load(1).defects[0].rounds==[1]
    assert service.load(2).defects[0].rounds==[1,2]
    wb=load_workbook(tmp_path/'execution/test-execution-results.xlsx')
    rows=list(wb.active.values)
    assert [list(row[-3:]) for row in rows[1:]]==[['failed','failed','pass'],['blocked','pass','pass'],['pass','pass','pass']]
    wb.close()
    (tmp_path/'validation-summary.json').write_text(json.dumps({'simulation':True,'real_model_calls':0,
        'synthetic_provider_calls':provider.calls,'rounds':3,'case_count':3,'defect_count':1,
        'status':'passed','verification_round':3,'verification_result':'pass','automatic_review_round':3,'result_matrix':matrix,'boundary':'仅验证程序串联，不验证模型质量或真实产品行为'},ensure_ascii=False,indent=2))
