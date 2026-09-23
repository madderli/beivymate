from beivymate.runtime.skill import Skill
from beivymate.model.artifact.requirement_understanding import UnderstandingArtifact
from beivymate.model.artifact.test_analysis import AnalysisArtifact
from beivymate.model.artifact.test_design import DesignArtifact
from beivymate.model.artifact.test_execution import ExecutionArtifact
from beivymate.runtime.checkpoint import digest


class TestReportSkill(Skill):
    def __init__(self,service):self.service=service
    def can_auto_authorize(self):return True
    def execute(self,context):
        from pathlib import Path
        output=context.get('report_output_directory')
        if not isinstance(output,str) or not output.strip():raise ValueError('report_output_directory required')
        Path(output).mkdir(parents=True,exist_ok=True)
        import tempfile
        with tempfile.TemporaryFile(dir=output):pass
        self.service.validate_template()
        values=list(context.get('step_inputs',{}).values())
        def one(cls):
            found=[v for v in values if isinstance(v,cls)]
            if len(found)>1:raise ValueError('Report accepts at most one '+cls.__name__)
            return found[0] if found else None
        understanding,analysis,design=one(UnderstandingArtifact),one(AnalysisArtifact),one(DesignArtifact)
        rounds=[v for v in values if isinstance(v,ExecutionArtifact)]
        if not rounds:raise ValueError('Report requires bound execution artifacts')
        hashes=context.get('accepted_artifact_hashes',{})
        for artifact in [understanding,analysis,design]+rounds:
            if artifact is None:continue
            if hashes.get(artifact.id)!=digest(artifact):raise ValueError('Report input is not accepted or has changed')
        if context.get('task_id')!=(design.task_id if design is not None else rounds[0].plan.task_id):raise ValueError('Report task mismatch')
        try:
            result=self.service.generate(understanding,analysis,design,rounds,simulation=context.get('simulation',False),previous=context.get('previous_report_artifact'))
        finally:
            metric=getattr(self.service.gateway,'last_metric',None)
            if metric:context.set('llm_calls',context.get('llm_calls',[])+[{**metric.model_dump(mode='json'),'step_id':context.get('step_id')}])
        context.set('test_report_artifact',result)
        context.set(f"steps.{context.get('step_id')}.test_report",result)
        output=context.get('report_output_directory')
        if not output:raise ValueError('report_output_directory required')
        directory = self.service.export(result,output)
        context.set('test_report_directory',str(directory))
        for key, name in (('test_report_data','report.json'), ('test_report_word','report.docx')):
            context.set(f"steps.{context.get('step_id')}.{key}", {'document_file':str(Path(directory)/name)})
    def review_subject(self,context):return context.get(f"steps.{context.get('step_id')}.test_report")
    def can_auto_accept(self,context):
        artifact=self.review_subject(context)
        # Auto review acknowledges a complete report record, never a release decision.
        return bool(artifact and context.get('test_report_directory')
                    and artifact.release_decision=='pending_human'
                    and artifact.sources and artifact.assessment.rationale)

    def validate_acceptance(self,context):
        if self.review_subject(context) is None:raise ValueError('Report required')
