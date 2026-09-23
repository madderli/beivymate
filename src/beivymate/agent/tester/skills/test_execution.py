"""Publish a completed durable execution round for downstream report generation."""
from beivymate.runtime.skill import Skill


class TestExecutionSkill(Skill):
    def __init__(self, service):
        self.service=service

    def can_auto_authorize(self):
        return True  # Only reads a finished round; script authorization happens in the service.

    def execute(self, context):
        number=context.get('execution_round_number')
        if not isinstance(number,int):
            raise ValueError('Select execution_round_number from the execution service')
        artifact=self.service.load(number)
        if not artifact.completed:
            raise ValueError('Finish the manual/script execution round before publishing its result')
        if context.get('task_id') != artifact.plan.task_id:
            raise ValueError('Execution task mismatch')
        self.service.export()
        for key, name in (('execution_results','test-execution-results.xlsx'), ('defects','defects.xlsx'), ('execution_history','execution-results.json')):
            context.set(f"steps.{context.get('step_id')}.{key}", {'document_file':str(self.service.directory/name)})
        context.set('test_execution_artifact',artifact)
        context.set(f"steps.{context.get('step_id')}.test_execution",artifact)

    def review_subject(self, context):
        return context.get(f"steps.{context.get('step_id')}.test_execution")

    def can_auto_accept(self, context):
        artifact=self.review_subject(context)
        if artifact is None or not artifact.completed:
            return False
        for item in artifact.plan.items:
            attempts=[a for a in artifact.attempts if a.item_id==item.id]
            if not attempts or attempts[-1].status not in {'pass','failed','blocked','error'}:
                return False
        return all(d.status == 'registered' for d in artifact.defects)

    def validate_acceptance(self, context):
        artifact=self.review_subject(context)
        if artifact is None or not artifact.completed:
            raise ValueError('Completed execution artifact required')
