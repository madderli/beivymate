import json

from beivymate.model.artifact.requirement_understanding import UnderstandingArtifact, SourceSnapshot
from beivymate.model.artifact.test_analysis import AnalysisArtifact, AnalysisData
from beivymate.model.entity.requirement import Requirement
from beivymate.knowledge.models import KnowledgeRequirement
from beivymate.runtime.checkpoint import digest
from beivymate.runtime.memory import ContextBudget
from beivymate.runtime.llm.models import LLMRequest, ChatMessage
from beivymate.runtime.skill import Skill


class TestAnalysisSkill(Skill):
    def __init__(self, gateway, model, template):
        self._gateway, self._model, self._template = gateway, model, template

    def knowledge_requirements(self):
        return [KnowledgeRequirement(category="testing", nature="foundational")]

    def can_auto_authorize(self):
        return True

    def review_subject(self, context):
        return context.get(f"steps.{context.get('step_id')}.test_analysis")

    def validate_acceptance(self, context):
        artifact = self.review_subject(context)
        if artifact is None:
            raise ValueError("Missing analysis artifact")
        artifact.require_data()

    def can_auto_accept(self, context):
        selection = context.get("context_selection")
        if selection is not None and selection.deferred:
            return False
        artifact = self.review_subject(context)
        if artifact is None or artifact.data is None:
            return False
        data = artifact.data
        return (not data.unknowns and data.scope.status == 'provided'
                and data.test_conditions.status == 'provided'
                and all(getattr(data, name).status != 'not_analyzed'
                        and all(item.basis == 'explicit' for item in getattr(data, name).items)
                        for name in type(data).model_fields if name != 'unknowns'))

    def execute(self, context):
        bound = context.get('step_inputs', {})
        requirements = [item for item in bound.values() if isinstance(item, Requirement)]
        upstream = [item for item in bound.values() if isinstance(item, UnderstandingArtifact)]
        if len(requirements) != 1 or len(upstream) != 1:
            raise ValueError('Test analysis requires one bound Requirement and one UnderstandingArtifact')
        requirement, understanding = requirements[0], upstream[0]
        understanding.require_data()
        accepted = context.get('accepted_artifact_hashes', {})
        if accepted.get(understanding.id) != digest(understanding):
            raise ValueError('Requirement understanding is not accepted or has changed')
        source = next((s for s in understanding.sources if s.ref == 'requirement:' + requirement.id), None)
        content = json.dumps(requirement.model_dump(exclude_none=True), ensure_ascii=False, sort_keys=True)
        if understanding.requirement_id != requirement.id or source is None or source.content != content:
            raise ValueError('Requirement differs from the accepted understanding input')
        knowledge = context.get_knowledge()
        sources = [SourceSnapshot.capture('requirement:' + requirement.id, content, source.version),
                   SourceSnapshot.capture('understanding:' + understanding.id, understanding.model_dump_json(), str(understanding.revision)),
                   SourceSnapshot.capture('template:' + self._template.id, self._template.content, self._template.version)]
        sources += [SourceSnapshot.capture('knowledge:' + k.id, k.content, k.version) for k in knowledge]
        prompt = json.dumps({
            'language': context.get_locale(), 'analysis_strategy': context.get('analysis_strategy', 'standard'),
            'requirement': requirement.model_dump(), 'understanding': understanding.data.model_dump(),
            'knowledge': [{'ref': 'knowledge:' + k.id, 'content': k.content} for k in knowledge],
            'template': self._template.content,
            'allowed_sources': [s.ref for s in sources if not s.ref.startswith('template:')],
            'schema': AnalysisData.model_json_schema(),
        }, ensure_ascii=False)
        budget = context.get('context_budget', ContextBudget())
        system = ('Perform test analysis. Return only JSON matching the supplied schema. '
                  'Preserve upstream unknowns and distinguish facts from proposed test concerns. '
                  'Do not generate executable cases, steps, scripts or release decisions. '
                  'simple: concise relevant conditions; standard: all dimensions; deep: dependencies and cross-product risks. '
                  'Never invent business rules or claim unexamined scope is covered.')
        context.set('context_usage_estimate', budget.check_request(system + '\n' + prompt))
        request = LLMRequest(model=self._model, messages=[ChatMessage(role='system', content=system),
            ChatMessage(role='user', content=prompt)], response_schema=AnalysisData.model_json_schema(),
            max_output_tokens=budget.output_reserve or None)
        try:
            response = self._gateway.chat(request)
        finally:
            metric = getattr(self._gateway, 'last_metric', None)
            if metric:
                context.set('llm_calls', context.get('llm_calls', []) + [{**metric.model_dump(mode='json'),
                    'task_id': context.get('task_id'), 'run_id': context.get('run_id'), 'step_id': context.get('step_id')}])
        if not response.content.strip():
            raise ValueError('Test analysis response is empty')
        metadata = dict(task_id=context.get('task_id'), run_id=context.get('run_id'), step_id=context.get('step_id', 'test_analysis'),
            requirement_id=requirement.id, understanding_id=understanding.id, understanding_revision=understanding.revision,
            understanding_hash=digest(understanding), model=self._model, locale=context.get_locale(), sources=sources,
            raw_response=response.content)
        try:
            body = response.content.strip()
            if body.startswith('```json\n') and body.endswith('```'):
                body = body[8:-3].strip()
            data = AnalysisData.model_validate_json(body)
            # Carry unresolved upstream questions even if the model omitted them.
            upstream_questions = {item.question for item in understanding.data.unknowns}
            data.unknowns = [item for item in data.unknowns if item.question not in upstream_questions]
            data.unknowns.extend(item.model_copy(deep=True, update={'source_refs': ['understanding:' + understanding.id]})
                                 for item in understanding.data.unknowns)
            artifact = AnalysisArtifact(**metadata, data=data, validation_status='structured')
        except ValueError as exc:
            artifact = AnalysisArtifact(**metadata, validation_status='unvalidated', validation_errors=[str(exc)])
        context.set('test_analysis_artifact', artifact)
        context.set(f"steps.{artifact.step_id}.test_analysis", artifact)
        context.set('test_analysis', artifact.markdown)
        context.set('stage_quality', context.get('stage_quality', []) + [{'artifact_id': artifact.id,
            'step_id': artifact.step_id, 'structured_valid': artifact.data is not None}])
