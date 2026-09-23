import json
from pathlib import Path
from uuid import uuid4

from beivymate.assets.excel import ExcelExporter
from beivymate.model.artifact.test_design import DesignData, DesignArtifact, RequirementReference
from beivymate.model.artifact.test_analysis import AnalysisArtifact
from beivymate.model.artifact.requirement_understanding import SourceSnapshot, UnderstandingArtifact
from beivymate.runtime.checkpoint import digest
from beivymate.runtime.llm.models import LLMRequest, ChatMessage
from beivymate.runtime.memory import ContextBudget
from beivymate.runtime.skill import Skill


class TestDesignSkill(Skill):
    def __init__(self, gateway, model, template, store, excel_template, mapping=None):
        self.gateway, self.model, self.template = gateway, model, template
        self.store = store
        self.excel_template = excel_template
        self.mapping = mapping

    def review_subject(self, context):
        return context.get(f"steps.{context.get('step_id')}.test_design")

    def can_auto_authorize(self):
        return True  # Writes only to the explicitly configured local asset store/output directory.

    def validate_acceptance(self, context):
        artifact = self.review_subject(context)
        if artifact is None:
            raise ValueError('No design artifact')
        artifact.require_data()
        if any(case.function_id is None for case in artifact.case_revisions):
            raise ValueError('Resolve unclassified case functions before acceptance')

    def on_accepted(self, context):
        artifact = self.review_subject(context)
        if artifact:
            self.store.accept_design(artifact)
            from beivymate.documents.case_assets import archive_cases
            archive_cases(artifact, self.store.catalog, context)

    def can_auto_accept(self, context):
        artifact = self.review_subject(context)
        return bool(artifact and not artifact.review_warnings and not artifact.inherited_unknowns and not artifact.proposals.uncovered
                    and artifact.case_revisions and all(c.function_id and not c.blocking_questions for c in artifact.case_revisions)
                    and all(p.action in {'new','reuse'} and not p.blocking_questions for p in artifact.proposals.cases))

    def execute(self, context):
        exporter = ExcelExporter(self.excel_template, self.mapping)  # Fail before model invocation.
        bound = context.get('step_inputs', {})
        analyses = [value for value in bound.values() if isinstance(value, AnalysisArtifact)]
        understandings = [value for value in bound.values() if isinstance(value, UnderstandingArtifact)]
        if len(analyses) > 1 or (not analyses and len(understandings) != 1):
            raise ValueError('Test design requires one bound accepted analysis or understanding artifact')
        analysis = analyses[0] if analyses else understandings[0]
        source_kind = 'analysis' if analyses else 'understanding'
        data = analysis.require_data()
        if context.get('accepted_artifact_hashes', {}).get(analysis.id) != digest(analysis):
            raise ValueError('Analysis is unaccepted or has changed')
        source = next((s for s in analysis.sources if s.ref == 'requirement:' + analysis.requirement_id), None)
        if source is None:
            raise ValueError('Analysis requires its requirement source snapshot')
        requirement_ref = RequirementReference(requirement_id=analysis.requirement_id,
            version=source.version, sha256=source.sha256)
        actor, maintainer = context.get('actor'), context.get('maintainer')
        if not isinstance(actor, str) or not actor.strip() or not isinstance(maintainer, str) or not maintainer.strip():
            raise ValueError('Actor and maintainer are required')
        output = Path(context.get('design_output_directory', ''))
        if not context.get('design_output_directory') or not output.is_dir():
            raise ValueError('Existing design_output_directory is required')
        versions = context.get('target_versions', {})
        if not versions:
            raise ValueError('Target product versions are required')
        findings = data.test_conditions.items if analyses else [item
            for name in type(data).model_fields if name != 'unknowns'
            for item in getattr(data, name).items]
        conditions = {f'{source_kind}:{analysis.id}:r{analysis.revision}:condition:{i}': item.model_dump()
                      for i,item in enumerate(findings, 1)}
        if not conditions:
            raise ValueError('Analysis contains no test conditions')
        candidates = [self.store.latest(identity) for identity in context.get('candidate_case_ids', [])]
        if any(c.project_id != context.get('project_id') or c.product_id not in versions for c in candidates):
            raise ValueError('Candidate case is outside the task product/project/version scope')
        candidate_ids = {c.id for c in candidates}
        payload = {'template':self.template.content, 'locale':context.get_locale(), source_kind:data.model_dump(),
                   'conditions':conditions, 'catalog':self.store.catalog.model_dump(), 'versions':versions,
                   'project_id':context.get('project_id'), 'existing_cases':[c.model_dump(mode='json') for c in candidates],
                   'schema':DesignData.model_json_schema()}
        system = ('Design test cases only, never execute or select an execution plan. Return JSON matching schema. '
                  'Each step has action, expected result and special data. Preserve unresolved questions. '
                  'Use only supplied product/function IDs and target versions. Never invent business rules or identities. '
                  'condition_refs must use supplied condition IDs. Every condition needs coverage or an uncovered reason, never both. '
                  'Existing cases may be reused/revised/retired only from the supplied candidates. '
                  'Reuse must preserve all case content and applicable_versions; only current condition_refs and blocking_questions may differ. '
                  'Use revise to change content or extend an older case to the target version. '
                  'No author, case number or automation state is model-generated.')
        prompt = json.dumps(payload, ensure_ascii=False)
        budget = context.get('context_budget', ContextBudget())
        context.set('context_usage_estimate', budget.check_request(system+'\n'+prompt))
        request = LLMRequest(model=self.model, messages=[ChatMessage(role='system',content=system),ChatMessage(role='user',content=prompt)],
                             response_schema=DesignData.model_json_schema(), max_output_tokens=budget.output_reserve or None)
        try:
            response = self.gateway.chat(request)
        finally:
            metric = getattr(self.gateway, 'last_metric', None)
            if metric:
                context.set('llm_calls', context.get('llm_calls', [])+[{**metric.model_dump(mode='json'), 'step_id':context.get('step_id'),
                    'task_id':context.get('task_id'),'run_id':context.get('run_id')}])
        context.set('test_design_raw_response', response.content)
        body = response.content.strip()
        if body.startswith('```json\n') and body.endswith('```'):
            body = body[8:-3].strip()
        proposals = DesignData.model_validate_json(body)
        warnings = []
        # A referenced condition can still have unresolved details. Preserve those
        # details as review blockers instead of also declaring it wholly uncovered.
        referenced = {ref for case in proposals.cases if case.action not in {'retire', 'discard'} for ref in case.condition_refs}
        remaining = []
        for item in proposals.uncovered:
            if item.condition_ref in referenced:
                warning = f'{item.condition_ref}: {item.reason}'
                warnings.append(warning)
                for case in proposals.cases:
                    if case.action not in {'retire', 'discard'} and item.condition_ref in case.condition_refs:
                        case.blocking_questions.append(item.reason)
            else:
                remaining.append(item)
        proposals.uncovered = remaining
        # Only fill an omitted classification when the product has one leaf.
        # Ambiguous catalogs retain the existing unclassified-draft behavior.
        parents = {node.parent_id for node in self.store.catalog.functions}
        for case in proposals.cases:
            if case.function_id is None and case.action == 'new':
                leaves = [node.id for node in self.store.catalog.functions
                          if node.product_id == case.product_id and node.id not in parents]
                if len(leaves) == 1:
                    case.function_id = leaves[0]
                    warnings.append(f'{case.title}: function_id assigned to sole product leaf {leaves[0]}')
        covered = set()
        seen_existing = set()
        for case in proposals.cases:
            self.store.catalog.check_function(case.product_id, case.function_id)
            if case.project_id != context.get('project_id'):
                raise ValueError('Case project scope mismatch')
            if case.product_id not in versions or (
                versions[case.product_id] not in case.applicable_versions if case.action == 'reuse'
                else case.applicable_versions != [versions[case.product_id]]):
                raise ValueError('Case target version mismatch')
            if set(case.condition_refs)-conditions.keys():
                raise ValueError('Unknown test condition reference')
            if case.action != 'new':
                if case.existing_id not in candidate_ids or case.existing_id in seen_existing:
                    raise ValueError('Unknown or repeated candidate identity')
                seen_existing.add(case.existing_id)
            if case.action not in {'retire', 'discard'}:
                covered.update(case.condition_refs)
            case.blocking_questions = list(dict.fromkeys(case.blocking_questions+[q.question for q in data.unknowns]))
        uncovered = {item.condition_ref for item in proposals.uncovered}
        if len(uncovered) != len(proposals.uncovered) or uncovered & covered or uncovered | covered != set(conditions):
            raise ValueError('Coverage must account for every condition exactly as covered or uncovered')
        design_id = str(uuid4())
        cases = self.store.apply_batch(proposals.cases, design_id=design_id, actor=actor, maintainer=maintainer, requirement_refs=[requirement_ref])
        coverage = {ref:[case.number for proposal,case in zip(proposals.cases,cases)
                         if ref in proposal.condition_refs and proposal.action not in {'retire', 'discard'}] for ref in conditions}
        artifact = DesignArtifact(id=design_id, step_id=context.get('step_id','test_design'), task_id=context.get('task_id'),
            run_id=context.get('run_id'), analysis_id=analysis.id if analyses else None, analysis_revision=analysis.revision if analyses else None, analysis_hash=digest(analysis) if analyses else None,
            input_kind=source_kind, input_id=analysis.id, input_revision=analysis.revision, input_hash=digest(analysis),
            sources=[SourceSnapshot.capture(source_kind+':'+analysis.id, analysis.model_dump_json(),str(analysis.revision)),
                     SourceSnapshot.capture('template:'+self.template.id,self.template.content,self.template.version),
                     SourceSnapshot.capture('catalog',self.store.catalog.model_dump_json())],
            project_id=context.get('project_id'), case_requirement_refs={c.id:[requirement_ref] for c in cases},
            raw_response=response.content, proposals=proposals, case_revisions=cases, coverage=coverage, review_warnings=warnings,
            inherited_unknowns=[q.question for q in data.unknowns], model=self.model, locale=context.get_locale())
        context.set('test_design_artifact',artifact)
        context.set(f'steps.{artifact.step_id}.test_design',artifact)
        artifact.save_new(output/(design_id+'.json'))
        context.set('test_design_exports', {'artifact':str(output/(design_id+'.json')), 'excel_status':'pending'})
        exporter.export(cases,output/(design_id+'.xlsx'), case_requirement_refs=artifact.case_requirement_refs)
        (output/(design_id+'.md')).write_text(artifact.markdown,encoding='utf-8')
        context.set('test_design_exports', {'artifact':str(output/(design_id+'.json')),
                    'excel':str(output/(design_id+'.xlsx')), 'summary':str(output/(design_id+'.md')), 'excel_status':'exported'})
        context.set(f'steps.{artifact.step_id}.test_design_data', {'document_file':str(output/(design_id+'.json'))})
        context.set(f'steps.{artifact.step_id}.test_cases', {'document_file':str(output/(design_id+'.xlsx'))})
        context.set('test_design',artifact.markdown)
        context.set('stage_quality',context.get('stage_quality',[])+[{'artifact_id':artifact.id,'step_id':artifact.step_id,
                    'structured_valid':True,'uncovered_conditions':len(uncovered)}])
