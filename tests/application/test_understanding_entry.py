import json
from beivymate.application.understand import start, runtime_for, export
from beivymate.configuration.models import TemplateDefinition
from beivymate.model.artifact.requirement_understanding import UnderstandingData
from beivymate.model.entity.requirement import Requirement
from beivymate.runtime.llm.gateway import LLMGateway
from beivymate.runtime.llm.models import LLMResponse
from beivymate.runtime.context import AgentContext


def test_requirement_to_saved_result_then_restore(tmp_path):
    class Provider:
        calls = 0
        def chat(self, request):
            self.calls += 1
            data = {name: {"status":"not_provided", "reason":"未定义"}
                    for name in UnderstandingData.model_fields if name != "unknowns"}
            data['objective_scope'] = {'status':'provided', 'items':[{'text':'支持支付','basis':'explicit','source_refs':['requirement:R']}]}
            data['unknowns'] = []
            return LLMResponse(model='fake',content=json.dumps(data))
    provider = Provider()
    gateway = LLMGateway(provider)
    directory = tmp_path / 'run'
    state = start(Requirement(id='R',title='支付',content='支持支付'),directory,gateway=gateway,model='fake')
    assert state.status == 'waiting_review'
    assert '支持支付' in (directory/'understanding.md').read_text()
    context = AgentContext.restore(state.context)
    runtime = runtime_for(TemplateDefinition.model_validate(context.get('execution_template')),gateway,'fake')
    state = runtime.resume(directory/'checkpoint.json',decision='approved',actor='human',expected_subject_hash=state.subject_hash)
    export(state,directory)
    assert state.accepted_artifact('understand').requirement_id == 'R'
    assert provider.calls == 1 and state.status == 'completed'


def test_retracted_business_revision_is_not_retrieved():
    from datetime import datetime, timezone
    from beivymate.model.business_change import BusinessChange, select_effective_changes
    old = BusinessChange(id='change', requirement_id='R', requirement_version='1', product_id='p',
        scope='product', affected_objects=['rule'], operation='modify', content='old', applicable_versions=['2'],
        status='effective', confirmed_by='human', confirmed_at=datetime.now(timezone.utc), evidence_refs=['release'])
    new = old.model_copy(update={'revision':2,'status':'withdrawn'})
    assert select_effective_changes([old,new],'p','2') == []
