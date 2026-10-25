import json
from urllib.error import HTTPError
import pytest
from fastapi.testclient import TestClient
from beivymate.application.web import create_app
from beivymate.models.catalog import ModelCatalog
from beivymate.models.runtime import FrozenGateway
from beivymate.runtime.llm.models import ChatMessage, LLMRequest, LLMResponse


class Vault:
    def __init__(self): self.values={}
    def get(self,owner,connection): return self.values.get((owner,connection))
    def save(self,owner,connection,secret): self.values[owner,connection]=secret
    def delete(self,owner,connection): self.values.pop((owner,connection),None)


def document(catalog,owner='owner'):
    doc=catalog.view(owner)
    doc['services']=[dict(id='local',name='Local',protocol='openai_compatible',endpoint='http://localhost:9999/v1',auth='none',enabled=True,selfCert=False)]
    doc['models']=[dict(id=i,serviceId='local',identifier='provider-'+i,name=i,enabled=True,capabilities=['text','structured'],orientation='均衡',currency='CNY') for i in ['a','b']]
    doc['defaults']['general']='a'
    return doc


def clean(doc):
    return {**doc,'services':[{k:v for k,v in s.items() if k not in ('configured','credentialError')} for s in doc['services']]}


def request(): return LLMRequest(model='ignored',messages=[ChatMessage(role='user',content='hello')])


def test_atomic_persistence_inherit_override_and_freezing(tmp_path,monkeypatch):
    catalog=ModelCatalog(tmp_path,Vault())
    saved=catalog.save('owner',document(catalog))
    inherited,_=catalog.gateway('owner',purpose='chat')
    assert inherited.snapshot['candidates'][0]['id']=='a'
    saved['defaults']['general']='b'
    updated=catalog.save('owner',clean(saved))
    assert catalog.snapshot('owner',purpose='chat')['candidates'][0]['id']=='b'
    assert catalog.snapshot('owner',purpose='skill')['candidates'][0]['id']=='b'
    assert catalog.snapshot('owner',purpose='skill',selection={'mode':'specific','model':'a'})['candidates'][0]['id']=='a'
    assert inherited.snapshot['candidates'][0]['id']=='a'
    with pytest.raises(FileExistsError): catalog.save('owner',clean(saved))
    restarted=ModelCatalog(tmp_path,Vault())
    assert restarted.view('owner')['defaults']['general']=='b'
    updated['defaults']['chat']='a'
    restarted.save('owner',clean(updated))
    assert restarted.snapshot('owner',purpose='chat')['candidates'][0]['id']=='a'
    assert restarted.snapshot('owner',purpose='skill')['candidates'][0]['id']=='b'


def test_secrets_do_not_enter_files_snapshots_or_responses(tmp_path):
    vault=Vault();catalog=ModelCatalog(tmp_path,vault)
    doc=document(catalog);doc['services'][0]['auth']='key'
    catalog.save('owner',doc)
    assert not catalog.view('owner')['services'][0]['configured']
    catalog.credential('owner','local','TOP-SECRET-123')
    assert catalog.view('owner')['services'][0]['configured']
    snapshot=catalog.snapshot('owner')
    assert 'TOP-SECRET' not in json.dumps(snapshot)
    assert all('TOP-SECRET' not in p.read_text() for p in catalog.directory.glob('*.json'))
    catalog.delete_credential('owner','local')
    with pytest.raises(ValueError,match='凭据'): catalog.snapshot('owner')


def test_bad_protocol_urls_defaults_and_capabilities(tmp_path):
    cat=ModelCatalog(tmp_path,Vault());doc=document(cat)
    doc['services'][0]['endpoint']='http://username:secret@localhost'
    with pytest.raises(ValueError): cat.save('owner',doc)
    doc=document(cat);doc['services'][0]['protocol']='anthropic'
    with pytest.raises(ValueError): cat.save('owner',doc)
    doc=document(cat);doc['models'][0]['enabled']=False
    with pytest.raises(ValueError): cat.save('owner',doc)
    doc=document(cat);doc['models'][0]['capabilities']=['text'];cat.save('owner',doc)
    with pytest.raises(ValueError,match='能力'): cat.snapshot('owner',required=['structured'])


def test_real_discovery_mapping_does_not_synthesize_offline_models(tmp_path,monkeypatch):
    cat=ModelCatalog(tmp_path,Vault());saved=cat.save('owner',document(cat))
    monkeypatch.setattr('beivymate.runtime.llm.transport.HTTPTransport.get_json',lambda self,url,headers:{'data':[{'id':'new-model'}]})
    assert cat.discover('owner','local')['models']==['new-model']
    assert len(cat.view('owner')['models'])==2
    assert all(m['enabled'] for m in cat.view('owner')['models'])


def test_bounded_failover_actual_model_and_non_transient_fail_closed(tmp_path,monkeypatch):
    cat=ModelCatalog(tmp_path,Vault());doc=document(cat)
    doc['failover'].update(strategy='same',retries=0);doc['backups']['均衡']=['b']
    cat.save('owner',doc)
    seen=[]
    class Provider:
        def chat(self,req):
            seen.append(req.model)
            if req.model=='provider-a':
                raise RuntimeError('status=429')
            return LLMResponse(model='actual-b',content='done')
    monkeypatch.setattr(FrozenGateway,'_provider',lambda self,c:Provider())
    gateway,_=cat.gateway('owner');response=gateway.chat(request())
    assert seen==['provider-a','provider-b'] and response.model=='actual-b'
    assert cat.usage('owner')['calls']==2
    class Bad:
        def chat(self,req): seen.append(req.model);raise RuntimeError('status=401 private body')
    monkeypatch.setattr(FrozenGateway,'_provider',lambda self,c:Bad())
    seen.clear()
    with pytest.raises(RuntimeError) as error: cat.gateway('owner')[0].chat(request())
    assert seen==['provider-a'] and 'private body' not in str(error.value)


def test_snapshot_rebuild_does_not_consult_new_default(tmp_path,monkeypatch):
    cat=ModelCatalog(tmp_path,Vault());saved=cat.save('owner',document(cat))
    gateway,_=cat.gateway('owner');binding=gateway.configuration_binding
    saved['defaults']['general']='b';cat.save('owner',clean(saved))
    from beivymate.application.app import create_gateway
    restored=create_gateway(**binding)
    assert restored.snapshot['candidates'][0]['id']=='a'


@pytest.fixture
def api(tmp_path):
    app=create_app(tmp_path,'setup',vault=Vault(),worker_enabled=False)
    with TestClient(app,base_url='http://127.0.0.1:8000',headers={'origin':'http://127.0.0.1:5173'}) as c:
        c.post('/api/v1/account/initialize',json={'username':'tester','name':'测试员','password':'Secure-Password-123!','setupToken':'setup'})
        session=c.post('/api/v1/session',json={'username':'tester','password':'Secure-Password-123!'}).json()
        c.headers['x-csrf-token']=session['csrfToken']
        owner=session['user']['id'];doc=document(app.state.model_catalog,owner)
        response=c.put('/api/v1/models',json=doc);assert response.status_code==200,response.text
        yield c,app,owner


def test_http_chat_preferences_actual_reply_idempotency_and_independence(api,monkeypatch):
    c,app,owner=api
    class Provider:
        def chat(self,req): return LLMResponse(model=req.model,content='reply '+req.model)
    monkeypatch.setattr(FrozenGateway,'_provider',lambda self,c:Provider())
    assert c.put('/api/v1/conversations/global/model',json={'model':''}).status_code==200
    def send(key):return c.post('/api/v1/conversations/global/messages',json={'text':'hello'},headers={'idempotency-key':key})
    first=send('one');assert first.status_code==200,first.text
    assert first.json()['model']=='provider-a'
    assert send('one').json()==first.json()
    doc=c.get('/api/v1/models').json();doc['defaults']['general']='b'
    assert c.put('/api/v1/models',json=clean(doc)).status_code==200
    assert send('two').json()['model']=='provider-b'
    assert c.put('/api/v1/conversations/global/model',json={'model':'a'}).status_code==200
    assert send('three').json()['model']=='provider-a'
    assert c.get('/api/v1/models').json()['defaults']['general']=='b'
    assert len(c.get('/api/v1/conversations/global/messages').json())==6
    assert c.get('/api/v1/conversations/workspace:other/messages').status_code==404
    c.headers.pop('x-csrf-token')
    assert c.put('/api/v1/models',json=doc).status_code==403


def test_model_and_credential_protection_until_task_closed(api):
    c,app,owner=api
    c.post('/api/v1/workspaces',json={'id':'space','name':'工作区'})
    response=c.post('/api/v1/tasks',data={'title':'任务','workspace':'space','workflow':'uat','description':'需求','version':'1'},headers={'idempotency-key':'task'})
    assert response.status_code==201,response.text
    taskid=response.json()['id']
    # Frozen run dependencies are recorded by the same model selection path used in prepare.
    app.state.model_catalog.snapshot(owner,task=taskid)
    doc=c.get('/api/v1/models').json();doc['models'][0]['name']='changed'
    assert c.put('/api/v1/models',json=clean(doc)).status_code==409
    assert c.put('/api/v1/account/credentials/local',json={'secret':'changed-key'}).status_code==409
    # Switching a shared default does not modify the model already frozen by a run.
    doc=c.get('/api/v1/models').json();doc['defaults']['general']='b'
    assert c.put('/api/v1/models',json=clean(doc)).status_code==200
    task=next(t for t in c.get('/api/v1/workbench').json()['tasks'] if t['id']==taskid)
    assert c.post(f'/api/v1/tasks/{taskid}/actions',json={'action':'close','expectedRevision':task['revision']},headers={'idempotency-key':'close'}).status_code==200
    doc=c.get('/api/v1/models').json();doc['models'][0]['name']='changed'
    assert c.put('/api/v1/models',json=clean(doc)).status_code==200


@pytest.mark.parametrize('status',[429,503,'timeout'])
def test_provider_transport_failover_and_retry_budget(tmp_path,monkeypatch,status):
    cat=ModelCatalog(tmp_path,Vault());doc=document(cat)
    doc['failover'].update(strategy='same',retries=1)
    doc['backups']['均衡']=['b'];cat.save('owner',doc)
    seen=[]
    def transport(self,url,payload,headers=None):
        seen.append(payload['model'])
        if payload['model']=='provider-a':
            if status=='timeout': raise TimeoutError('timed out')
            error=HTTPError(url,status,'transient',{},None)
            raise RuntimeError('request failed') from error
        return {'model':'provider-b','choices':[{'finish_reason':'stop','message':{'content':'ok'}}]}
    monkeypatch.setattr('beivymate.runtime.llm.transport.HTTPTransport.post_json',transport)
    monkeypatch.setattr('beivymate.models.runtime.time.sleep',lambda _:None)
    gateway,_=cat.gateway('owner')
    assert gateway.chat(request()).model=='provider-b'
    assert seen==['provider-a','provider-a','provider-b']


def test_invalid_model_selection_returns_validation_error(api):
    client,_,_=api
    for selection in ([],123,{'mode':'unknown'},{'model':[]},{'capabilities':None}):
        assert client.post('/api/v1/models/resolve',json={'selection':selection}).status_code==422
    assert client.post('/api/v1/models/resolve',json={'required':None}).status_code==422


def test_original_ui_fields_persist_and_draft_discovery_does_not_save(api,monkeypatch):
    client,app,owner=api
    saved=client.get('/api/v1/models').json()
    saved['services'][0]['kind']='自定义'
    saved['models'][0].update(lineage='客户内部部署',registryTier='均衡',registryCapabilities=['结构化输出（JSON）'],
        capabilitySource='calibrated',calibrations=[{'at':'2026-10-21T00:00:00Z','before':[],
        'after':['结构化输出（JSON）'],'contextK':128,'note':'人工核对文档'}])
    response=client.put('/api/v1/models',json=clean(saved))
    assert response.status_code==200,response.text
    reloaded=ModelCatalog(app.state.model_catalog.root,app.state.model_catalog.vault).view(owner)
    assert reloaded['services'][0]['kind']=='自定义'
    assert reloaded['models'][0]['lineage']=='客户内部部署'
    assert reloaded['models'][0]['calibrations'][0]['note']=='人工核对文档'
    before=client.get('/api/v1/models').json()
    def discover(self,url,headers):
        assert headers['Authorization']=='Bearer temporary-secret'
        return {'data':[{'id':'discovered'}]}
    monkeypatch.setattr('beivymate.runtime.llm.transport.HTTPTransport.get_json',discover)
    result=client.post('/api/v1/models/connection/discover',json={'service':dict(id='draft',name='草稿连接',
        endpoint='http://localhost:9999/v1',protocol='openai_compatible',auth='key'), 'secret':'temporary-secret'})
    assert result.status_code==200,result.text
    assert result.json()['models']==['discovered']
    assert client.get('/api/v1/models').json()==before
    assert app.state.model_catalog.vault.get(owner,'draft') is None


def test_replacement_preview_apply_conflicts_and_locked_runs(api):
    client,app,owner=api
    client.put('/api/v1/conversations/global/model',json={'model':'a'})
    plan=client.post('/api/v1/models/replacement-preview',json={'source':'a','target':'b'})
    assert plan.status_code==200,plan.text
    body=plan.json()
    assert {'default:general','chat:global'}.issubset({i['id'] for i in body['items']})
    result=client.post('/api/v1/models/replace',json={'source':'a','target':'b','revision':body['revision'],'selected':['default:general','chat:global']})
    assert result.status_code==200,result.text
    assert len(result.json()['applied'])==2 and not result.json()['failed']
    assert client.get('/api/v1/models').json()['defaults']['general']=='b'
    assert client.get('/api/v1/conversations/global/model').json()['model']=='b'
    stale=client.post('/api/v1/models/replace',json={'source':'a','target':'b','revision':body['revision'],'selected':['default:general']})
    assert stale.status_code==409
    invalid=client.post('/api/v1/models/replace',json={'source':'b','target':'a','revision':'bad','selected':['default:general']})
    assert invalid.status_code==409


def test_cost_respects_price_unit_actual_model_and_unknown_usage(tmp_path,monkeypatch):
    cat=ModelCatalog(tmp_path,Vault());doc=document(cat)
    doc['models'][0].update(inputPrice=2,outputPrice=4,priceUnit=1000)
    cat.save('owner',doc)
    from beivymate.runtime.llm.models import LLMUsage
    class Provider:
        def chat(self,req):return LLMResponse(model='actual-build-name',content='ok',usage=LLMUsage(input_tokens=1000,output_tokens=500))
    monkeypatch.setattr(FrozenGateway,'_provider',lambda self,c:Provider())
    cat.gateway('owner')[0].chat(request())
    assert cat.usage('owner')['costs']['CNY']==4
    import sqlite3
    with sqlite3.connect(cat.metrics) as db:
        assert db.execute('SELECT actual_model FROM model_call').fetchone()[0]=='actual-build-name'
    doc=cat.view('owner');doc['models'][0]['priceUnit']=1000000;cat.save('owner',clean(doc))
    cat.gateway('owner')[0].chat(request())
    assert cat.usage('owner')['costs']['CNY']==pytest.approx(4.004)


def test_new_catalog_has_no_demo_models(tmp_path):
    catalog=ModelCatalog(tmp_path,Vault())
    assert catalog.view('new-user')['services']==[]
    assert catalog.view('new-user')['models']==[]


def test_skill_replacement_preserves_body_and_replaces_quoted_metadata(api):
    client,app,owner=api
    center=app.state.model_catalog.portal.skill_center
    content='---\nid: replace_skill\nname: Replace skill\ndescription: Check replacement\nrole: common\nmodel: "a"\nmodel_preference: {"mode":"specific","model":"a"}\n---\n\nExample:\nmodel: a\n'
    center.save('replace_skill',dict(content=content,files=[],state='draft'))
    plan=client.post('/api/v1/models/replacement-preview',json={'source':'a','target':'b'}).json()
    result=client.post('/api/v1/models/replace',json={'source':'a','target':'b','revision':plan['revision'],'selected':['skill:replace_skill']})
    assert result.status_code==200,result.text
    assert result.json()['applied']==['skill:replace_skill']
    from beivymate.markdown.metadata import read_markdown
    entry,_=center._entry('replace_skill')
    metadata,body=read_markdown(entry)
    assert metadata['model']=='b'
    assert json.loads(metadata['model_preference'])['model']=='b'
    assert 'Example:\nmodel: a' in body
    assert center.package(entry,False)['state']=='draft'


def test_discovery_has_bounded_timeout_and_keeps_full_directory(api,monkeypatch):
    client,_,_=api
    def get(self,url,headers):
        assert self.config.timeout==30
        assert url=='https://api.openai.com/v1/models'
        assert headers['Authorization']=='Bearer fixture-secret'
        return {'data':[{'id':f'model-{i}'} for i in range(127)]}
    monkeypatch.setattr('beivymate.runtime.llm.transport.HTTPTransport.get_json',get)
    result=client.post('/api/v1/models/connection/discover',json={'service':dict(id='openai',name='OpenAI',endpoint='https://api.openai.com/v1',auth='key',protocol='openai_compatible'),'secret':'fixture-secret'})
    assert result.status_code==200,result.text
    assert len(result.json()['models'])==127


def test_transport_uses_system_proxy_and_reports_timeout(monkeypatch):
    from beivymate.runtime.llm.transport import HTTPTransport
    from beivymate.runtime.llm.models import LLMConnectionConfig
    from urllib import request as urllib_request
    monkeypatch.setattr(urllib_request,'getproxies',lambda:{'https':'http://127.0.0.1:9999'})
    transport=HTTPTransport(LLMConnectionConfig(base_url='https://api.openai.com/v1',timeout=30))
    handler=next(h for h in transport._opener.handlers if isinstance(h,urllib_request.ProxyHandler))
    assert handler.proxies['https']=='http://127.0.0.1:9999'
    def timeout(*args,**kwargs):raise TimeoutError()
    monkeypatch.setattr(transport._opener,'open',timeout)
    with pytest.raises(RuntimeError,match='超时'):
        transport.get_json('https://api.openai.com/v1/models')


def test_transport_loads_trusted_ca_and_explains_certificate_failure(monkeypatch):
    import ssl
    from urllib.error import URLError
    from beivymate.runtime.llm.transport import HTTPTransport
    from beivymate.runtime.llm.models import LLMConnectionConfig
    from urllib.request import HTTPSHandler
    transport=HTTPTransport(LLMConnectionConfig(base_url='https://api.openai.com/v1'))
    handler=next(h for h in transport._opener.handlers if isinstance(h,HTTPSHandler))
    assert handler._context.verify_mode==ssl.CERT_REQUIRED
    assert handler._context.check_hostname
    assert handler._context.cert_store_stats()['x509_ca']>0
    def failure(*args,**kwargs):raise URLError(ssl.SSLCertVerificationError('untrusted certificate'))
    monkeypatch.setattr(transport._opener,'open',failure)
    with pytest.raises(RuntimeError,match='证书校验失败'):
        transport.get_json('https://api.openai.com/v1/models')


@pytest.mark.parametrize('status,phrase',[(400,'连接信息'),(401,'API Key'),(403,'权限'),(404,'Base URL'),(407,'代理'),(408,'超时'),(429,'额度'),(503,'暂时不可用'),(418,'未能提供')])
def test_directory_http_errors_are_readable_and_do_not_echo_response(monkeypatch,status,phrase):
    from beivymate.runtime.llm.transport import HTTPTransport
    from beivymate.runtime.llm.models import LLMConnectionConfig
    from io import BytesIO
    transport=HTTPTransport(LLMConnectionConfig(base_url='https://example.com/v1'))
    def failure(*args,**kwargs):
        raise HTTPError('https://example.com/v1/models',status,'raw traceback secret',{},BytesIO(b'<script>secret</script>'))
    monkeypatch.setattr(transport._opener,'open',failure)
    with pytest.raises(RuntimeError) as result:
        transport.get_json('https://example.com/v1/models')
    assert phrase in str(result.value)
    assert all(word not in str(result.value) for word in ['HTTP','script','secret','traceback'])


@pytest.mark.parametrize('payload',[[],{}, {'data':None}])
def test_unrecognized_directory_has_readable_error(api,monkeypatch,payload):
    client,_,_=api
    monkeypatch.setattr('beivymate.runtime.llm.transport.HTTPTransport.get_json',lambda *args,**kwargs:payload)
    response=client.post('/api/v1/models/connection/discover',json={'service':dict(id='test',name='test',endpoint='https://example.com/v1',auth='none',protocol='openai_compatible')})
    assert response.status_code==422
    assert '目录' in response.json()['message']


def test_probe_returns_timestamp_and_hides_provider_details(api,monkeypatch):
    client,_,_=api
    def respond(self,request):
        assert self.snapshot['policy']['timeout']==30
        assert len(self.snapshot['candidates'])==1
        return LLMResponse(model='actual-provider-model',content='OK')
    monkeypatch.setattr(FrozenGateway,'chat',respond)
    response=client.post('/api/v1/models/a/test')
    assert response.status_code==200,response.text
    assert response.json()['actualModel']=='actual-provider-model'
    from datetime import datetime
    assert datetime.fromisoformat(response.json()['testedAt']).tzinfo
    def fail(self,request):
        raise RuntimeError('status=401 body=<script>secret</script>')
    monkeypatch.setattr(FrozenGateway,'chat',fail)
    failure=client.post('/api/v1/models/a/test')
    assert failure.status_code==422
    assert 'API Key' in failure.json()['message']
    assert 'script' not in failure.text and 'secret' not in failure.text


def test_explicit_blank_or_new_discovery_key_never_falls_back(api,monkeypatch):
    client,app,owner=api
    service=dict(id='local',name='Local',endpoint='http://localhost:9999/v1',auth='key',protocol='openai_compatible')
    app.state.model_catalog.vault.save(owner,'local','stored-secret')
    seen=[]
    def get(self,url,headers):
        seen.append(headers['Authorization'])
        if headers['Authorization']=='Bearer changed-invalid':raise RuntimeError('API Key 无效')
        return {'data':[{'id':'a'}]}
    monkeypatch.setattr('beivymate.runtime.llm.transport.HTTPTransport.get_json',get)
    assert client.post('/api/v1/models/connection/discover',json={'service':service,'secret':''}).status_code==422
    assert seen==[]
    assert client.post('/api/v1/models/connection/discover',json={'service':service,'secret':'changed-invalid'}).status_code==422
    assert seen==['Bearer changed-invalid']
    assert client.post('/api/v1/models/connection/discover',json={'service':service}).status_code==200
    assert seen[-1]=='Bearer stored-secret'


@pytest.mark.parametrize('status,phrase',[(401,'API Key'),(400,'请求参数'),(429,'额度')])
def test_real_gateway_probe_keeps_safe_failure_reason(api,monkeypatch,status,phrase):
    client,_,_=api
    def post(*args,**kwargs):
        try:raise HTTPError('https://example.test',status,'private-secret',{},None)
        except HTTPError as error:raise RuntimeError('private-secret body') from error
    monkeypatch.setattr('beivymate.runtime.llm.transport.HTTPTransport.post_json',post)
    response=client.post('/api/v1/models/a/test')
    assert response.status_code==422
    assert phrase in response.json()['message']
    assert 'private-secret' not in response.text


def test_probe_omits_temperature_and_reports_output_limit(api,monkeypatch):
    client,_,_=api
    def post(self,url,payload,headers):
        assert 'temperature' not in payload
        assert payload['max_completion_tokens']==1024
        return {'model':'reasoning-model','choices':[{'finish_reason':'length','message':{'content':''}}]}
    monkeypatch.setattr('beivymate.runtime.llm.transport.HTTPTransport.post_json',post)
    result=client.post('/api/v1/models/a/test')
    assert result.status_code==422
    assert '输出上限' in result.json()['message']


def test_custom_long_timeout_persists_and_reaches_runtime(tmp_path):
    catalog=ModelCatalog(tmp_path,Vault())
    doc=document(catalog)
    doc['failover']['timeout']=900
    catalog.save('owner',doc)
    assert catalog.snapshot('owner')['policy']['timeout']==900
    doc=catalog.view('owner')
    doc['failover']['timeout']=0
    with pytest.raises(ValueError):catalog.save('owner',clean(doc))


def test_mutually_exclusive_defaults_resolve_after_reload(tmp_path):
    catalog=ModelCatalog(tmp_path,Vault())
    doc=document(catalog)
    doc['defaults']={'general':'','chat':'a','skill':'b'}
    catalog.save('owner',doc)
    restarted=ModelCatalog(tmp_path,Vault())
    assert restarted.snapshot('owner',purpose='chat')['candidates'][0]['id']=='a'
    assert restarted.snapshot('owner',purpose='skill')['candidates'][0]['id']=='b'
    doc=restarted.view('owner');doc['defaults']={'general':'b','chat':'','skill':''}
    restarted.save('owner',clean(doc))
    assert restarted.snapshot('owner',purpose='chat')['candidates'][0]['id']=='b'
    assert restarted.snapshot('owner',purpose='skill')['candidates'][0]['id']=='b'
