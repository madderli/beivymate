import hashlib
import json
from datetime import datetime, timezone
from uuid import uuid4
from pathlib import Path
from beivymate.reporting.word_exporter import WordReportExporter
from beivymate.model.artifact.requirement_understanding import SourceSnapshot
from beivymate.model.artifact.test_report import ReportArtifact, ReportAssessment
from beivymate.runtime.checkpoint import digest
from beivymate.runtime.memory import ContextBudget
from beivymate.runtime.llm.models import LLMRequest, ChatMessage


class ReportService:
    def __init__(self,gateway,model,template):
        self.gateway,self.model,self.template=gateway,model,Path(template)

    def validate_template(self):
        WordReportExporter(self.template).validate_template()

    def generate(self,understanding,analysis,design,rounds,*,simulation=False,previous=None):
        self.validate_template()
        template_hash=hashlib.sha256(self.template.read_bytes()).hexdigest()
        for upstream in (understanding,analysis,design):
            if upstream is not None:upstream.require_data()
        if analysis is not None and understanding is not None and (analysis.understanding_id!=understanding.id or analysis.understanding_hash!=digest(understanding)):
            raise ValueError('Analysis/understanding mismatch')
        if design is not None and analysis is not None and (design.analysis_id!=analysis.id or design.analysis_hash!=digest(analysis)):
            raise ValueError('Design/analysis mismatch')
        if not rounds: raise ValueError('Select execution rounds')
        task=design.task_id if design is not None else rounds[0].plan.task_id
        if not task or any(r.plan.task_id!=task or not r.completed for r in rounds):
            raise ValueError('Report requires completed rounds from the same task')
        for upstream in (understanding,analysis):
            if upstream is not None and upstream.task_id != task:
                raise ValueError('Upstream task mismatch')
        if understanding is not None and analysis is not None and understanding.requirement_id != analysis.requirement_id:
            raise ValueError('Requirement mismatch')
        if previous is not None and previous.task_id != task:
            raise ValueError('Previous report task mismatch')
        if len({r.round_number for r in rounds})!=len(rounds): raise ValueError('Duplicate rounds')
        if design is not None and (len(design.proposals.cases)!=len(design.case_revisions) or
            len({c.id for c in design.case_revisions})!=len(design.case_revisions)):
            raise ValueError('Design case/proposal mapping is ambiguous')
        expected=({c.id:c for p,c in zip(design.proposals.cases,design.case_revisions) if p.action not in {'retire','discard'}}
            if design is not None else {i.case.id:i.case for r in rounds for i in r.plan.items})
        latest={}; defects={};history=[]; environments=set();executors=set();times=[];scopes={}
        for r in sorted(rounds,key=lambda x:x.round_number):
            if len({i.id for i in r.plan.items})!=len(r.plan.items) or len({i.case.id for i in r.plan.items})!=len(r.plan.items):
                raise ValueError('Duplicate execution item scope')
            if any(a.item_id not in {i.id for i in r.plan.items} for a in r.attempts):
                raise ValueError('Execution attempt refers to an unknown item')
            for item in r.plan.items:
                c=item.case
                if c.id not in expected or c.revision!=expected[c.id].revision or c.product_id!=expected[c.id].product_id or c.project_id!=expected[c.id].project_id:
                    raise ValueError('Execution case scope differs from design')
                fields=('title','description','preconditions','priority','steps','function_id','related_function_ids','applicable_versions')
                if any(getattr(c,k)!=getattr(expected[c.id],k) for k in fields):
                    raise ValueError('Execution case content differs from selected revision')
                if item.product_version not in expected[c.id].applicable_versions: raise ValueError('Execution version mismatch')
                scope=(item.environment,item.product_version)
                if c.id in scopes and scopes[c.id]!=scope: raise ValueError('Select consistent environment/version rounds')
                scopes[c.id]=scope;environments.add(item.environment)
                attempts=[a for a in r.attempts if a.item_id==item.id]
                if not attempts or attempts[-1].status not in {'pass','failed','blocked','error'}:
                    raise ValueError('Execution has no terminal result')
                latest[c.id]=attempts[-1].status
                for a in attempts:
                    executors.add(a.executor)
                    for stamp in (a.started_at,a.ended_at):
                        if stamp:
                            parsed=datetime.fromisoformat(stamp)
                            if parsed.tzinfo is None:raise ValueError('Execution timestamp requires timezone')
                            times.append(parsed.astimezone(timezone.utc).isoformat())
                    history.append({'round':r.round_number,'case':c.number,'attempt':a.id,'status':a.status, 'actual_result':a.reason, 'observations':[o.model_dump() for o in a.observations],
                        'evidence':a.evidence, 'executor':a.executor, 'mode':a.mode})
            for d in r.defects: defects[d.number]=d.model_dump(mode='json')
        counts={s:0 for s in ('pass','failed','blocked','not_run')};rows=[]
        for identity,c in expected.items():
            status=latest.get(identity,'not_run');display='blocked' if status=='error' else status
            counts[display]+=1
            rows.append({'case':c.number,'revision':c.revision,'function':c.function_id,'status':display})
        limitations=['未配置客户上线准入标准；不评估客户环境适配性。','缺陷关闭状态未提供，复测通过不等于关闭。',
                      '硬件、网络及专项测试结果：未提供。','覆盖引用完整不代表需求已经完整实现。']
        missing=[name for name,value in [('需求理解',understanding),('测试分析',analysis),('测试设计',design)] if value is None]
        if missing:limitations.append('本流程未提供：'+', '.join(missing)+'；不能判断完整需求符合性。')
        if simulation: limitations.insert(0,'模拟验证报告：不得作为真实产品发布依据。')
        if any(v=='error' for v in latest.values()):limitations.append('执行器错误在汇总中计入 blocked，详见尝试历史。')
        facts={'task_id':task,'requirement_id':understanding.requirement_id if understanding is not None else '未提供','rounds':sorted(r.round_number for r in rounds),
            'counts':counts,'total':len(expected),'executed':counts['pass']+counts['failed'],
            'pass_rate':f"{counts['pass']}/{len(expected)}" if expected else '暂无数据',
            'pass_rate_denominator':'计划设计范围内全部有效用例，包含阻塞和未执行',
            'cases':rows,'attempt_history':history,'defects':list(defects.values()),'environments':sorted(environments),
            'versions':sorted({v for _,v in scopes.values()}),'executors':sorted(executors),
            'period':[min(times),max(times)] if times else [],
            'requirement_scope':understanding.data.model_dump() if understanding is not None else None,'analysis':analysis.data.model_dump() if analysis is not None else None,
            'design_questions':{c.id:p.blocking_questions for p,c in zip(design.proposals.cases,design.case_revisions)} if design else {},
            'design_warnings':design.review_warnings if design else [],
            'coverage':design.coverage if design is not None else {},'uncovered':[u.model_dump() for u in design.proposals.uncovered] if design is not None else []}
        payload=json.dumps({'facts':facts,'limitations':limitations,'simulation':simulation},ensure_ascii=False)
        system='根据给定过程事实用中文评估需求符合性、已发现缺陷对客户的影响和风险。不得编造数字、关闭状态、工具或环境。没有准入标准不能声称满足上线标准。仅提供建议，人类决定发布。返回指定 JSON。'
        budget=ContextBudget();budget.check_request(system+payload)
        response=self.gateway.chat(LLMRequest(model=self.model,messages=[ChatMessage(role='system',content=system),ChatMessage(role='user',content=payload)],response_schema=ReportAssessment.model_json_schema(),max_output_tokens=budget.output_reserve))
        assessment=ReportAssessment.model_validate_json(response.content)
        model_assessment=assessment.model_copy(deep=True)
        if missing or simulation or counts['blocked'] or counts['not_run'] or not expected:
            assessment.recommendation='无法评估'
        elif counts['failed']:
            assessment.recommendation='不建议发布'
        elif assessment.recommendation=='建议发布':
            assessment.recommendation='有条件发布'
            limitations.append('仍需人类确认上线标准和遗留缺陷影响。')
        adjustment_reasons=[]
        if assessment.recommendation != model_assessment.recommendation:
            adjustment_reasons.append('程序依据模拟标记、输入完整性、执行结果及未配置准入标准限制发布建议。')
            assessment.rationale='；'.join(adjustment_reasons)+' 最终决定由人类作出。'
        sources=[SourceSnapshot.capture(label+':'+a.id,a.model_dump_json()) for label,a in
            [('understanding',understanding),('analysis',analysis),('design',design)]+[('execution',r) for r in rounds] if a is not None]
        sources.append(SourceSnapshot.capture('template-sha256',template_hash))
        return ReportArtifact(task_id=task,simulation=simulation,sources=sources,facts=facts,assessment=assessment,
            raw_response=response.content,model=self.model,limitations=limitations,
            model_assessment=model_assessment, adjustment_reasons=adjustment_reasons,
            series_id=previous.series_id if previous else uuid4().hex,
            revision=previous.revision+1 if previous else 1, previous_report_id=previous.id if previous else None)

    def export(self, artifact, directory, *, resume=False):
        return WordReportExporter(self.template).export(artifact,directory,resume=resume)

    @staticmethod
    def render(artifact):
        return WordReportExporter.render(artifact)
