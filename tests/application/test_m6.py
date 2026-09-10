import json
from pathlib import Path

import pytest

from beivymate.application.composition import create_tester_agent
from beivymate.model.artifact.requirement_understanding import UnderstandingData
from beivymate.model.artifact.test_analysis import AnalysisData, AnalysisArtifact
from beivymate.model.entity.requirement import Requirement
from beivymate.runtime.context import AgentContext
from beivymate.runtime.llm.gateway import LLMGateway
from beivymate.runtime.llm.models import LLMResponse
from beivymate.agent.tester.skills.test_analysis import TestAnalysisSkill as AnalysisSkill
from beivymate.configuration.models import TemplateDefinition

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / 'resources/configuration/workflow/m6_test_analysis.md'


class Provider:
    def __init__(self):
        self.requests = []
        self.invalid = False

    def chat(self, request):
        self.requests.append(request)
        analysis = len(self.requests) > 1
        if analysis and self.invalid:
            return LLMResponse(model='fake', content='not json')
        cls = AnalysisData if analysis else UnderstandingData
        data = {name: {'status':'not_provided', 'reason':'资料不足'}
                for name in cls.model_fields if name != 'unknowns'}
        name = 'scope' if analysis else 'objective_scope'
        data[name] = {'status':'provided', 'items':[{'text':'支付状态', 'basis':'explicit', 'source_refs':['requirement:R']}]}
        data['unknowns'] = [] if analysis else [{'question':'超时如何处理？','impact':'异常范围不确定',
            'blocking':True,'source_refs':['requirement:R']}]
        return LLMResponse(model='fake', content=json.dumps(data,ensure_ascii=False))


def agent(provider):
    return create_tester_agent(str(WORKFLOW), LLMGateway(provider), 'fake')


def waiting(provider, tmp_path):
    a = agent(provider)
    path = tmp_path/'checkpoint.json'
    state = a.start(Requirement(id='R',title='支付',content='支持支付'),path)
    return a, path, state


def test_m6_two_stage_restart_and_persist(tmp_path):
    provider = Provider()
    a, path, state = waiting(provider,tmp_path)
    assert state.status == 'waiting_review' and len(provider.requests) == 1
    state = agent(provider).resume(path,decision='approved',actor='tester',expected_subject_hash=state.subject_hash)
    assert state.status == 'waiting_review' and state.index == 1 and len(provider.requests) == 2
    artifact = AgentContext.restore(state.context).get('test_analysis_artifact')
    assert isinstance(artifact,AnalysisArtifact)
    assert artifact.data.unknowns[0].blocking  # Not dropped by the downstream model.
    assert artifact.understanding_id == state.accepted_artifact('understand').id
    assert '超时如何处理' in provider.requests[1].messages[1].content
    output = tmp_path/'analysis.json'
    artifact.save_new(output)
    assert AnalysisArtifact.load(output) == artifact
    state = agent(provider).resume(path,decision='approved',actor='tester',expected_subject_hash=state.subject_hash)
    assert state.status == 'completed'
    assert state.accepted_artifact('analyze','test_analysis').id == artifact.id
    assert len(provider.requests) == 2


@pytest.mark.parametrize('mode',['unaccepted','changed_requirement','changed_artifact'])
def test_analysis_rejects_bad_upstream_before_llm(tmp_path,mode):
    provider = Provider()
    a,path,state = waiting(provider,tmp_path)
    context = AgentContext.restore(state.context)
    upstream = context.get('tester_requirement_understanding_artifact')
    from beivymate.runtime.checkpoint import digest
    context.set('accepted_artifact_hashes',{} if mode == 'unaccepted' else {upstream.id:digest(upstream)})
    req = context.get('requirement')
    if mode == 'changed_requirement':
        req.content = 'different'
    if mode == 'changed_artifact':
        upstream.revision += 1
    context.set('step_inputs',{'requirement':req,'upstream':upstream})
    skill = AnalysisSkill(LLMGateway(provider),'fake',TemplateDefinition(id='t',name='T',role='tester',version='1'))
    with pytest.raises(ValueError):
        skill.execute(context)
    assert len(provider.requests) == 1


def test_invalid_output_stays_pending_and_cannot_be_accepted(tmp_path):
    provider = Provider()
    a,path,state = waiting(provider,tmp_path)
    provider.invalid = True
    state = a.resume(path,decision='approved',actor='tester',expected_subject_hash=state.subject_hash)
    artifact = AgentContext.restore(state.context).get('test_analysis_artifact')
    assert artifact.validation_status == 'unvalidated'
    with pytest.raises(ValueError,match='not structurally validated'):
        a.resume(path,decision='approved',actor='tester',expected_subject_hash=state.subject_hash)
