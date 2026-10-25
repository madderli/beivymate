"""Real local API and transaction tests; provider directory is the only substitute."""
import base64
from datetime import date, timedelta
import json
from pathlib import Path
import pytest
from test_catalog import api, clean


def directory(monkeypatch, entries=None):
    monkeypatch.setattr('beivymate.runtime.llm.transport.HTTPTransport.get_json',lambda *args,**kwargs:{'data':entries or [{'id':'provider-a'},{'id':'provider-b'},{'id':'provider-new'}]})


def candidate(client,monkeypatch,source='a',target='provider-b'):
    directory(monkeypatch)
    result=client.post('/api/v1/models/maintenance/latest',json={'source':source})
    assert result.status_code==200,result.text
    return {'source':source,'session':result.json()['session'],'identifier':target,'capabilities':['text','structured']}


def preview(client,body):
    response=client.post('/api/v1/models/maintenance/preview',json=body)
    assert response.status_code==200,response.text
    return response.json()


def custom_skill(app,identity='custom_model',model='a'):
    center=app.state.skill_center
    content=f'---\nid: {identity}\nname: Custom\ndescription: Real package\nrole: common\nmodel: "{model}"\nmodel_preference: {{"mode":"specific","model":"{model}","capabilities":[]}}\n---\n\nInstructions\nmodel: a\n'
    center.save(identity,{'content':content,'state':'draft','files':[{'path':'assets/binary.dat','content':base64.b64encode(b'\x00\xffdata').decode()}]})
    return center._entry(identity)[0]


def test_upgrade_previews_and_pins_unselected_default(api,monkeypatch):
    client,app,owner=api
    body=candidate(client,monkeypatch)
    plan=preview(client,body)
    selected=['default:general','default:skill']
    result=client.post('/api/v1/models/maintenance/commit',json={**body,'revision':plan['revision'],'selected':selected})
    assert result.status_code==200,result.text
    doc=client.get('/api/v1/models').json()
    assert doc['defaults']=={'general':'b','chat':'a','skill':'b'}
    assert client.post('/api/v1/models/maintenance/commit',json={**body,'revision':plan['revision'],'selected':selected}).status_code==409
    history=client.get('/api/v1/models/lifecycle').json()['history']
    assert len(history)==1 and history[0]['owner']==owner


def test_upgrade_new_candidate_and_capabilities_are_explicit(api,monkeypatch):
    client,app,owner=api
    body=candidate(client,monkeypatch,target='provider-new')
    assert len(client.get('/api/v1/models').json()['models'])==2
    plan=preview(client,body)
    assert plan['target']['inputPrice'] is None
    assert plan['target']['contextK'] is None
    result=client.post('/api/v1/models/maintenance/commit',json={**body,'revision':plan['revision'],'selected':['default:general','default:skill','default:chat']})
    assert result.status_code==200,result.text
    assert len(client.get('/api/v1/models').json()['models'])==3


def test_skill_change_preserves_assets_and_invalidates_publication(api,monkeypatch):
    client,app,owner=api
    entry=custom_skill(app)
    original=app.state.skill_center.package(entry,False)
    registry=app.state.skill_center.registry
    registry.validate('skill','custom_model',original['revision'],[])
    registry.publish('skill','custom_model',original['revision'])
    assert app.state.skill_center.package(entry,False)['state']=='published'
    body=candidate(client,monkeypatch)
    plan=preview(client,body)
    result=client.post('/api/v1/models/maintenance/commit',json={**body,'revision':plan['revision'],'selected':['skill:custom_model']})
    assert result.status_code==200,result.text
    assert 'model: "b"' in entry.read_text()
    assert '\nInstructions\nmodel: a' in entry.read_text()
    assert (entry.parent/'assets/binary.dat').read_bytes()==b'\x00\xffdata'
    assert app.state.skill_center.package(entry,False)['state']=='draft'


def test_atomic_failure_rolls_back_all_files_and_chats(api,monkeypatch):
    client,app,owner=api
    entry=custom_skill(app)
    original=entry.read_bytes()
    client.put('/api/v1/conversations/global/model',json={'model':'a'})
    body=candidate(client,monkeypatch);plan=preview(client,body)
    import beivymate.models.maintenance as module
    write=module.atomic_write;failed=False
    def fail(path,raw):
        nonlocal failed
        if Path(path)==app.state.model_catalog.path(owner) and not failed:
            failed=True;raise OSError('injected disk failure')
        write(path,raw)
    monkeypatch.setattr(module,'atomic_write',fail)
    result=client.post('/api/v1/models/maintenance/commit',json={**body,'revision':plan['revision'],'selected':['skill:custom_model','chat:global','default:general']})
    assert result.status_code==422,result.text
    assert entry.read_bytes()==original
    assert client.get('/api/v1/models').json()['defaults']['general']=='a'
    assert client.get('/api/v1/conversations/global/model').json()['model']=='a'
    assert client.get('/api/v1/models/lifecycle').json()['history']==[]


def test_delete_with_references_creates_missing_not_default_fallback(api):
    client,app,owner=api
    entry=custom_skill(app)
    doc=client.get('/api/v1/models').json();doc['defaults'].update(general='b',chat='a')
    assert client.put('/api/v1/models',json=clean(doc)).status_code==200
    plan=preview(client,{'source':'a','action':'delete'})
    assert plan['canDelete'],plan['items']
    result=client.post('/api/v1/models/maintenance/commit',json={'source':'a','action':'delete','confirm':True,'revision':plan['revision']})
    assert result.status_code==200,result.text
    doc=client.get('/api/v1/models').json()
    assert all(m['id']!='a' for m in doc['models'])
    assert doc['defaults']['chat']=='missing:a'
    assert 'missing:a' in entry.read_text()
    response=client.post('/api/v1/models/resolve',json={'purpose':'chat'})
    assert response.status_code==422
    assert '重新配置' in response.text
    assert client.get('/api/v1/models/lifecycle').json()['resources']['skill:custom_model']['status']=='missing'


def test_builtin_or_unclosed_references_block_delete(api):
    client,app,owner=api
    plan=preview(client,{'source':'a','action':'delete'})
    assert not plan['canDelete']
    response=client.post('/api/v1/models/maintenance/commit',json={'source':'a','action':'delete','revision':plan['revision'],'confirm':True})
    assert response.status_code==409
    doc=client.get('/api/v1/models').json();doc['models']=[m for m in doc['models'] if m['id']!='b']
    assert client.put('/api/v1/models',json=clean(doc)).status_code==422


def test_retirement_checks_unknown_offline_and_runtime_fallback(api,monkeypatch):
    client,app,owner=api
    shutdown=(date.today()-timedelta(days=1)).isoformat()
    directory(monkeypatch,[{'id':'provider-a','shutdown_date':shutdown},{'id':'provider-b'}])
    result=client.post('/api/v1/models/lifecycle/check',json={})
    assert result.status_code==200,result.text
    assert result.json()['models']['a']['status']=='retired'
    assert result.json()['models']['b']['status']=='unknown'
    assert client.post('/api/v1/models/resolve',json={'selection':'a'}).status_code==422
    doc=client.get('/api/v1/models').json();doc['failover']['strategy']='same';doc['backups']['均衡']=['b']
    assert client.put('/api/v1/models',json=clean(doc)).status_code==200
    result=client.post('/api/v1/models/resolve',json={'selection':'a'})
    assert result.status_code==200 and result.json()['modelId']=='b'
    def fail(*a,**k):raise RuntimeError('无法连接厂商')
    monkeypatch.setattr('beivymate.runtime.llm.transport.HTTPTransport.get_json',fail)
    result=client.post('/api/v1/models/lifecycle/check',json={})
    assert result.status_code==200 and result.json()['errors']
    assert result.json()['models']['a']['shutdownDate']==shutdown


def test_directory_absence_is_not_retirement(api,monkeypatch):
    client,app,owner=api
    directory(monkeypatch,[{'id':'other'}])
    result=client.post('/api/v1/models/lifecycle/check',json={})
    assert result.json()['models']['a']['status']=='unknown'
    assert '无法据此确认' in result.json()['models']['a']['message']


def test_frozen_gateway_rechecks_retirement_without_changing_snapshot(api,monkeypatch):
    client,app,owner=api
    catalog=app.state.model_catalog
    doc=client.get('/api/v1/models').json();doc['failover']['strategy']='same';doc['backups']['均衡']=['b']
    client.put('/api/v1/models',json=clean(doc))
    gateway,_=catalog.gateway(owner)
    assert gateway.snapshot['candidates'][0]['id']=='a'
    directory(monkeypatch,[{'id':'provider-a','shutdown_date':(date.today()-timedelta(days=1)).isoformat()},{'id':'provider-b'}])
    client.post('/api/v1/models/lifecycle/check',json={})
    from beivymate.models.runtime import FrozenGateway
    from beivymate.runtime.llm.models import LLMRequest,ChatMessage,LLMResponse
    seen=[]
    class Provider:
        def chat(self,request):seen.append(request.model);return LLMResponse(model=request.model,content='ok')
    monkeypatch.setattr(FrozenGateway,'_provider',lambda *args:Provider())
    assert gateway.chat(LLMRequest(model='ignored',messages=[ChatMessage(role='user',content='go')])).model=='provider-b'
    assert seen==['provider-b']
    assert gateway.snapshot['candidates'][0]['id']=='a'
    gateway.snapshot['policy']['strategy']='error'
    with pytest.raises(ValueError,match='停用日期'):gateway.chat(LLMRequest(model='ignored',messages=[ChatMessage(role='user',content='go')]))


def test_workflow_step_replacement_and_package_independence(api,monkeypatch):
    client,app,owner=api
    library=app.state.configuration_library
    folder=library.customer/'workflows';folder.mkdir(parents=True,exist_ok=True)
    path=folder/'custom_flow.md'
    path.write_text('---\nid: custom_flow\nname: Custom flow\n---\n## 步骤：understand\n- 技能：requirement_understand\n- 模型：a\n')
    body=candidate(client,monkeypatch);plan=preview(client,body)
    ref='workflow:custom_flow:understand'
    assert next(i for i in plan['items'] if i['id']==ref)['eligible']
    response=client.post('/api/v1/models/maintenance/commit',json={**body,'revision':plan['revision'],'selected':[ref]})
    assert response.status_code==200,response.text
    from beivymate.configuration.loader import load_workflow_definition
    assert load_workflow_definition(path).resolved_steps()[0].model=='b'
    assert client.post('/api/v1/models/maintenance/workflows/custom_flow/publish').status_code==422
    validated=client.post('/api/v1/models/maintenance/workflows/custom_flow/validate')
    assert validated.status_code==200 and validated.json()['state']=='validated',validated.text
    assert client.post('/api/v1/models/maintenance/workflows/custom_flow/publish').status_code==200

    from beivymate.application.composition import create_tester_agent
    resolved=[]
    def resolve(spec):resolved.append(spec.model);return object(),spec.model
    agent=create_tester_agent(str(path),object(),'fallback',skill_model_resolver=resolve)
    assert resolved==['b']
    assert agent._workflow.skills[0].snapshot['resolved_model']=='b'


def test_recovery_restores_uncommitted_file_journal(api):
    client,app,owner=api
    maintenance=app.state.model_catalog.maintenance
    path=app.state.model_catalog.path(owner)
    before=path.read_bytes();path.write_text('broken')
    maintenance.journal.write_text(json.dumps({'id':'uncommitted','files':[{'path':str(path),'before':base64.b64encode(before).decode()}]}))
    maintenance.recover()
    assert path.read_bytes()==before
    assert not maintenance.journal.exists()


def test_skill_fail_fast_overrides_global_fallback(api,monkeypatch):
    client,app,owner=api
    directory(monkeypatch,[{'id':'provider-a','shutdown_date':(date.today()-timedelta(days=1)).isoformat()},{'id':'provider-b'}])
    client.post('/api/v1/models/lifecycle/check',json={})
    doc=client.get('/api/v1/models').json();doc['failover']['strategy']='same';doc['backups']['均衡']=['b']
    client.put('/api/v1/models',json=clean(doc))
    response=client.post('/api/v1/models/resolve',json={'selection':{'mode':'specific','model':'a','failureStrategy':'fail_fast'}})
    assert response.status_code==422
    response=client.post('/api/v1/models/resolve',json={'selection':{'mode':'specific','model':'a','failureStrategy':'fallback'}})
    assert response.status_code==200 and response.json()['modelId']=='b'


def test_missing_date_field_preserves_known_shutdown_and_endpoint_change_invalidates_it(api,monkeypatch):
    client,app,owner=api
    shutdown=(date.today()-timedelta(days=1)).isoformat()
    directory(monkeypatch,[{'id':'provider-a','shutdown_date':shutdown},{'id':'provider-b'}])
    client.post('/api/v1/models/lifecycle/check',json={})
    directory(monkeypatch,[{'id':'provider-a'},{'id':'provider-b'}])
    checked=client.post('/api/v1/models/lifecycle/check',json={})
    assert checked.json()['models']['a']['shutdownDate']==shutdown
    doc=client.get('/api/v1/models').json();doc['services'][0]['endpoint']='http://localhost:8888/v1'
    assert client.put('/api/v1/models',json=clean(doc)).status_code==200
    assert client.get('/api/v1/models/lifecycle').json()['models']['a']['status']=='unknown'


def test_unselected_tier_skill_is_pinned_to_original(api,monkeypatch):
    client,app,owner=api
    entry=custom_skill(app)
    content=entry.read_text().replace('model: "a"\n','').replace('"mode":"specific","model":"a"','"mode":"tier","tier":"均衡","model":""')
    package=app.state.skill_center.package(entry,False)
    app.state.skill_center.save('custom_model',{'content':content,'state':'draft','files':package['files'],'revision':package['revision']})
    doc=client.get('/api/v1/models').json();doc['tiers']['均衡']='a'
    client.put('/api/v1/models',json=clean(doc))
    body=candidate(client,monkeypatch);plan=preview(client,body)
    result=client.post('/api/v1/models/maintenance/commit',json={**body,'revision':plan['revision'],'selected':['tier:均衡']})
    assert result.status_code==200,result.text
    assert client.get('/api/v1/models').json()['tiers']['均衡']=='b'
    assert 'model: "a"' in entry.read_text()
    assert '"mode": "specific"' in entry.read_text()


def test_replace_unreferenced_model_updates_library_without_reference_selection(api,monkeypatch):
    client,app,owner=api
    body=candidate(client,monkeypatch,source='b',target='provider-new')
    plan=preview(client,body)
    assert plan['items']==[]
    result=client.post('/api/v1/models/maintenance/commit',json={**body,'revision':plan['revision'],'selected':[]})
    assert result.status_code==200,result.text
    doc=client.get('/api/v1/models').json()
    assert {m['identifier'] for m in doc['models']}=={'provider-a','provider-new'}
    assert doc['defaults']['general']=='a'
    assert client.get('/api/v1/models/lifecycle').json()['history'][0]['source']=='provider-b'


def test_empty_selection_cannot_bypass_existing_references(api,monkeypatch):
    client,app,owner=api
    body=candidate(client,monkeypatch)
    plan=preview(client,body)
    assert plan['items']
    result=client.post('/api/v1/models/maintenance/commit',json={**body,'revision':plan['revision'],'selected':[]})
    assert result.status_code==422
    assert client.get('/api/v1/models').json()['defaults']['general']=='a'


def test_deleting_last_model_removes_its_vendor(api):
    client,app,owner=api
    doc=client.get('/api/v1/models').json()
    doc['services'].append({**doc['services'][0],'id':'other'})
    doc['models'][1]['serviceId']='other'
    doc['models'].append({**doc['models'][1],'id':'other-b','identifier':'provider-other-b'})
    assert client.put('/api/v1/models',json=clean(doc)).status_code==200
    for source in ['other-b','b']:
        body={'source':source,'action':'delete'}
        plan=preview(client,body)
        result=client.post('/api/v1/models/maintenance/commit',json={**body,'revision':plan['revision'],'confirm':True})
        assert result.status_code==200,result.text
        doc=client.get('/api/v1/models').json()
        assert len(doc['services'])==(2 if source=='other-b' else 1)
    assert [s['id'] for s in doc['services']]==['local']
    assert [m['id'] for m in doc['models']]==['a']


@pytest.mark.parametrize('entry,expected',[
    ({'id':'provider-a'},'unknown'),
    ({'id':'provider-a','is_latest':True},'latest'),
    ({'id':'provider-a','latest_model_id':'provider-a'},'latest'),
    ({'id':'provider-a','latest_model_id':'provider-b'},'update_available'),
    ({'id':'provider-a','latest_model_id':'not-in-directory'},'unknown'),
    ({'id':'provider-a','is_latest':True,'latest_model_id':'provider-b'},'unknown'),
    ({'id':'provider-a','is_latest':False,'latest_model_id':'provider-a'},'unknown'),
    ({'id':'provider-a','is_latest':'true'},'unknown'),
    ({'id':'provider-a','is_latest':True,'latest_model_id':42},'unknown'),
])
def test_version_check_requires_explicit_consistent_provider_evidence(api,monkeypatch,entry,expected):
    client,app,owner=api
    directory(monkeypatch,[entry,{'id':'provider-b'}])
    result=client.post('/api/v1/models/lifecycle/check',json={'models':['a']})
    assert result.status_code==200,result.text
    assert result.json()['checkedModels']==['a']
    fact=result.json()['models']['a']
    assert fact['versionStatus']==expected
    if expected=='update_available':assert fact['latestModel']=='provider-b'


def test_version_check_does_not_reuse_previous_version_conclusion(api,monkeypatch):
    client,app,owner=api
    directory(monkeypatch,[{'id':'provider-a','is_latest':True}])
    assert client.post('/api/v1/models/lifecycle/check',json={'models':['a']}).json()['models']['a']['versionStatus']=='latest'
    directory(monkeypatch,[{'id':'provider-a'}])
    assert client.post('/api/v1/models/lifecycle/check',json={'models':['a']}).json()['models']['a']['versionStatus']=='unknown'
    directory(monkeypatch,[{'id':'provider-b'}])
    assert client.post('/api/v1/models/lifecycle/check',json={'models':['a']}).json()['models']['a']['versionStatus']=='unknown'
