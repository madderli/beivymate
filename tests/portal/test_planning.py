import json
from pathlib import Path
import sqlite3
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from beivymate.application.web import create_app
from beivymate.portal.service import PortalService
from beivymate.identity.service import IdentityError

ROOT = Path(__file__).resolve().parents[2] / 'resources/configuration/workflow'


@pytest.fixture
def portal(tmp_path):
    app = create_app(tmp_path, 'setup', builtin_skill_root=Path(__file__).resolve().parents[2] / 'tests/fixtures/legacy-resources/skills')
    with TestClient(app, base_url='http://127.0.0.1:8000', headers={'origin':'http://127.0.0.1:5173'}) as c:
        assert c.post('/api/v1/account/initialize',json={'username':'tester','password':'Secure-Password-123!','name':'测试人员','setupToken':'setup'}).status_code==201
        session = c.post('/api/v1/session',json={'username':'tester','password':'Secure-Password-123!'}).json()
        c.headers['x-csrf-token']=session['csrfToken']
        for id in ('HIS','CIS'):
            assert c.post('/api/v1/workspaces',json={'shortName':id,'name':id+'工作空间'}).status_code==201
        yield c, app.state.portal, session['user']['id']


def workspace_id(client, short_name):
    return next((workspace['id'] for workspace in client.get('/api/v1/workbench').json()['workspaces']
                 if workspace['shortName'] == short_name), short_name)


def create(c, *, related=None, key='create-key', **changes):
    data={'title':'支付需求','workspace':workspace_id(c, 'HIS'),'workflow':'uat','description':'验证支付','version':'1','environment':'uat','locale':'zh-CN','relatedWorkspaces':json.dumps([workspace_id(c, name) for name in related or []])}
    data.update(changes)
    return c.post('/api/v1/tasks', data=data,files=[('attachments',('需求.md','支付业务'.encode(),'text/markdown'))],headers={'idempotency-key':key})


def action(c, task, verb, key=None):
    return c.post(f"/api/v1/tasks/{task['id']}/actions",json={'action':verb,'expectedRevision':task['revision']},headers={'idempotency-key':key or str(uuid.uuid4())})


def test_group_persistence_attachments_and_retry(portal):
    c, service, owner = portal
    r=create(c,related=['CIS']);assert r.status_code==201,r.text
    assert create(c,related=['CIS']).json()==r.json()
    board=c.get('/api/v1/workbench').json(); tasks=board['tasks']
    assert len(tasks)==2 and tasks[0]['id'].endswith('-M') and tasks[1]['id'].endswith('-R01')
    assert tasks[0]['group']==tasks[1]['group'] and tasks[0]['main'] and not tasks[1]['main']
    assert create(c,related=['CIS'],title='不同内容').status_code==409
    again=PortalService(service.root, ROOT)
    assert len(again.board(owner)['tasks'])==2
    for task in tasks:
        a=task['attachments'][0]
        response=c.get(f"/api/v1/tasks/{task['id']}/attachments/{a['id']}")
        assert response.content=='支付业务'.encode()
        assert response.headers['content-disposition'].startswith('attachment;')
    assert again.board('other-user')['tasks']==[]
    with pytest.raises(IdentityError): again.attachment('other-user',tasks[0]['id'],tasks[0]['attachments'][0]['id'])


def test_configuration_conflict_and_manual_edit(portal):
    c, _, _ = portal
    create(c)
    task=c.get('/api/v1/workbench').json()['tasks'][0]
    path=Path(task['configPath']);path.write_text(path.read_text().replace('支付需求','客户修改需求'))
    assert c.patch('/api/v1/tasks/'+task['id'],json={'title':'页面旧草稿','expectedRevision':task['revision']}).status_code==409
    new=c.get('/api/v1/workbench').json()['tasks'][0]
    assert new['title']=='客户修改需求'
    assert c.patch('/api/v1/tasks/'+task['id'],json={'version':'2','expectedRevision':new['revision']}).status_code==200
    assert c.get('/api/v1/workbench').json()['tasks'][0]['version']=='2'
    ws=c.get('/api/v1/workbench').json()['workspaces'][0]
    Path(ws['configPath']).write_text(Path(ws['configPath']).read_text().replace('公司共享资料','新的知识资料'))
    assert c.patch(f"/api/v1/workspaces/{workspace_id(c, 'HIS')}",json={'name':'旧页面','expectedRevision':ws['revision']}).status_code==409


def test_pause_resume_preserves_tasks_and_unique_ids(portal):
    c, service, _ = portal
    create(c,related=['CIS'])
    main, child=c.get('/api/v1/workbench').json()['tasks']
    assert action(c,main,'start').status_code==409
    assert action(c,main,'pause','pause-key').status_code==200
    assert action(c,main,'pause','pause-key').status_code==200
    main=c.get('/api/v1/workbench').json()['tasks'][0]
    ws=c.get('/api/v1/workbench').json()['workspaces'][0]
    assert c.patch(f"/api/v1/workspaces/{workspace_id(c, 'HIS')}",json={'paused':True,'expectedRevision':ws['revision']}).status_code==409
    # Historical paused workspaces must still reject new work and support reenable.
    with service.db() as db:
        db.execute("UPDATE entity SET status='paused' WHERE id=?", (ws["id"],))
    assert action(c,main,'resume').status_code==409
    assert create(c,key='paused-new').status_code==409
    assert action(c,main,'delete').status_code==409
    assert action(c,child,'delete').status_code==409
    assert action(c,main,'delete').status_code==409
    assert len(c.get('/api/v1/workbench').json()['tasks'])==2
    assert c.delete(f"/api/v1/workspaces/{workspace_id(c, 'HIS')}").status_code==405
    ws=c.get('/api/v1/workbench').json()['workspaces'][0]
    c.patch(f"/api/v1/workspaces/{workspace_id(c, 'HIS')}",json={'paused':False,'expectedRevision':ws['revision']})
    assert create(c,key='next').json()['id']!=main['id']


def test_reject_invalid_uploads_and_cross_task_access(portal):
    c, _, _ = portal
    assert create(c,related=['CIS','CIS']).status_code==422
    assert create(c,related=['UNKNOWN']).status_code==404
    assert c.get('/api/v1/workbench').json()['tasks']==[]
    assert create(c,workflow='unknown').status_code==422
    assert c.post('/api/v1/tasks',data={'title':'x'},files={'attachments':('../escape.md',b'x')},headers={'idempotency-key':'bad'}).status_code==422
    create(c)
    first=c.get('/api/v1/workbench').json()['tasks'][0]
    other=create(c,key='another').json()['id']
    assert c.get(f"/api/v1/tasks/{other}/attachments/{first['attachments'][0]['id']}").status_code==404
    assert c.post('/api/v1/workspaces',json={'id':'../escape','name':'bad'}).status_code==422
    assert c.post('/api/v1/workspaces',json={'id':'TASK-2026-00001-M','name':'冲突编号'}).status_code==422
    assert c.post('/api/v1/tasks',headers={'x-csrf-token':'invalid'},data={}).status_code==403


def test_file_journal_recovers_after_write_failure(portal, monkeypatch):
    c, service, owner = portal
    import beivymate.portal.service as module
    original=module.os.replace
    def fail(*args): raise OSError('simulated disk failure')
    monkeypatch.setattr(module.os,'replace',fail)
    assert create(c).status_code==503
    monkeypatch.setattr(module.os,'replace',original)
    restored=PortalService(service.root, ROOT)
    assert len(restored.board(owner)['tasks'])==1
    assert create(c).status_code==201
    assert len(restored.board(owner)['tasks'])==1


def test_parallel_numbering(portal):
    c, service, owner = portal
    fields={'title':'需求','workspace':workspace_id(c, 'HIS'),'workflow':'uat','description':'正文','version':'1','environment':'uat'}
    with ThreadPoolExecutor(max_workers=4) as pool:
        ids=list(pool.map(lambda n:service.create_task(owner,fields,[],str(n))['id'],range(8)))
    assert len(set(ids))==8


def test_optional_execution_fields_and_strategy_roundtrip(portal):
    c, _, _ = portal
    for strategy in ('simple', 'standard', 'deep'):
        result = create(c, key=strategy, environment='', testCasesPath='', analysisStrategy=strategy)
        assert result.status_code == 201, result.text
        task = next(t for t in c.get('/api/v1/workbench').json()['tasks'] if t['id'] == result.json()['id'])
        assert task['environment'] == task['testCasesPath'] == ''
        assert task['analysisStrategy'] == strategy
        assert f'analysisStrategy: "{strategy}"' in Path(task['configPath']).read_text()
        assert c.patch('/api/v1/tasks/' + task['id'], json={'environment': '', 'testCasesPath': '', 'expectedRevision': task['revision']}).status_code == 200


def test_configuration_api_readonly_copy_and_conflict(portal):
    c, _, _ = portal
    entry = c.get('/api/v1/configuration/skills').json()['items'][0]
    endpoint = '/api/v1/configuration/skills/' + entry['id']
    assert c.put(endpoint,json={'content':entry['content'],'revision':entry['revision']}).status_code==403
    content=entry['content'].replace('id: '+entry['id'],'id: customer_skill')
    created=c.put('/api/v1/configuration/skills/customer_skill',json={'content':content,'copyFrom':entry['id']})
    assert created.status_code==200, created.text
    item=created.json()
    Path(item['path']).write_text(content+'\n业务补充\n')
    assert c.put('/api/v1/configuration/skills/customer_skill',json={'content':content,'revision':item['revision']}).status_code==409


def test_default_workspace_is_durable_and_uses_workspace_revision(portal):
    c, service, owner = portal
    before = c.get('/api/v1/workbench').json()
    assert before['defaultWorkspace'] == workspace_id(c, 'HIS')
    ws = next(w for w in before['workspaces'] if w['id'] == workspace_id(c, 'CIS'))
    response = c.patch(f"/api/v1/workspaces/{workspace_id(c, 'CIS')}", json={
        'isDefault': True, 'expectedRevision': ws['revision']})
    assert response.status_code == 200, response.text
    assert c.get('/api/v1/workbench').json()['defaultWorkspace'] == workspace_id(c, 'CIS')
    assert c.patch(f"/api/v1/workspaces/{workspace_id(c, 'CIS')}", json={
        'isDefault': True, 'expectedRevision': ws['revision']}).status_code == 409
    owner = c.get('/api/v1/session').json()['user']['id']
    reopened = PortalService(service.root, ROOT)
    assert reopened.board(owner)['defaultWorkspace'] == workspace_id(c, 'CIS')
    assert reopened.board('another-user')['defaultWorkspace'] == ''
    assert c.patch('/api/v1/workspaces/missing', json={'isDefault': True}).status_code == 404


def test_workspace_knowledge_references_and_distinct_id(portal, tmp_path):
    c, service, owner = portal
    path = tmp_path / 'shared'
    source = c.post('/api/v1/knowledge-sources', json={
        'name': '公司规范', 'kind': 'directory', 'storage': 'local', 'path': str(path),
    }).json()
    payload = {'shortName': 'LAB', 'name': '检验协同', 'description': '检验需求',
               'knowledgeDirectories': [str(tmp_path / 'private.md')],
               'knowledgeSourceIds': [source['id']], 'isDefault': True}
    created = c.post('/api/v1/workspaces', json=payload)
    assert created.status_code == 201, created.text
    space_id = created.json()['id']
    assert space_id != 'LAB'
    assert c.post('/api/v1/workspaces', json=payload).status_code == 409
    for invalid in ('1234', 'abc', 'AB-1', 'ABCDE'):
        assert c.post('/api/v1/workspaces', json={**payload, 'shortName': invalid}).status_code == 422
    assert c.post('/api/v1/workspaces', json={
        **payload, 'shortName': 'OTHR', 'knowledgeSourceIds': ['0' * 32]
    }).status_code == 422
    board = PortalService(service.root, ROOT).board(owner)
    workspace = next(w for w in board['workspaces'] if w['id'] == space_id)
    assert workspace['shortName'] == 'LAB'
    assert workspace['knowledgeDirectories'] == payload['knowledgeDirectories']
    assert workspace['knowledgeSources'] == [{'id': source['id'], 'name': '公司规范'}]
    assert board['defaultWorkspace'] == space_id
    assert c.get('/api/v1/workspaces/knowledge-sources').json()['items'] == workspace['knowledgeSources']
    assert c.get(f"/api/v1/knowledge-sources/{source['id']}/references").json()['items'][0]['id'] == space_id


def test_workspace_locked_until_task_is_closed(portal):
    c, service, owner = portal
    created = create(c)
    assert created.status_code == 201
    task_id = created.json()['id']
    workspace = service.board(owner)['workspaces'][0]
    url = f"/api/v1/workspaces/{workspace['id']}"
    with service.db() as db:
        db.execute("UPDATE entity SET status='completed' WHERE id=?", (task_id,))
    for changes in ({'name': '不能更改'}, {'paused': True}):
        response = c.patch(url, json={**changes, 'expectedRevision': workspace['revision']})
        assert response.status_code == 409
        assert '未关闭任务' in response.json()['message']
    with service.db() as db:
        db.execute("UPDATE task_lifecycle SET closed_at='closed' WHERE task=?", (task_id,))
    assert c.patch(url, json={'shortName': 'NEW', 'expectedRevision': workspace['revision']}).status_code == 422
    response = c.patch(url, json={'name': '新名称', 'expectedRevision': workspace['revision']})
    assert response.status_code == 200, response.text
    assert service.board(owner)['tasks'][0]['workspace'] == workspace['id']


def test_workspace_disable_rechecks_pending_and_reenable_preserves_configuration(portal):
    c, _, _ = portal
    workspace = c.get('/api/v1/workbench').json()['workspaces'][0]
    url = f"/api/v1/workspaces/{workspace['id']}"
    successor = workspace_id(c, 'CIS')
    assert c.patch(url, json={'paused': True, 'expectedRevision':workspace['revision']}).status_code == 422
    assert c.patch(url, json={'paused': True, 'expectedRevision':workspace['revision'], 'replacementDefault': successor}).status_code == 200
    assert c.get('/api/v1/workbench').json()['defaultWorkspace'] == successor
    disabled = c.get('/api/v1/workbench').json()['workspaces'][0]
    assert disabled['paused'] is True
    assert disabled['name'] == workspace['name']
    assert create(c).status_code == 409
    assert c.patch(f"/api/v1/workspaces/{workspace_id(c, 'HIS')}", json={'paused': False, 'expectedRevision': disabled['revision']}).status_code == 200
    assert create(c).status_code == 201
    current = c.get('/api/v1/workbench').json()['workspaces'][0]
    response = c.patch(f"/api/v1/workspaces/{workspace_id(c, 'HIS')}", json={'paused': True, 'expectedRevision': current['revision']})
    assert response.status_code == 409
    assert '未关闭任务' in response.json()['message']
    assert not c.get('/api/v1/workbench').json()['workspaces'][0]['paused']


def test_skill_center_http_uses_files_not_browser_data(portal):
    c, service, owner = portal
    initial = c.get('/api/v1/skill-center')
    assert initial.status_code == 200
    assert {x['id'] for x in initial.json()['items']} == {'requirement_understand','test_analysis','test_design','test_execution','test_report'}
    content = '---\nid: http_skill\nname: HTTP skill\ndescription: Real disk package\nrole: common\nversion: "1"\n---\n\nRead the input.'
    body = {'content':content,'state':'draft','files':[{'path':'references/rules.md','text':'business rules'}]}
    saved = c.put('/api/v1/skill-center/http_skill', json=body)
    assert saved.status_code == 200, saved.text
    assert (service.skill_root/'http_skill/references/rules.md').read_text() == 'business rules'
    assert next(s for s in c.get('/api/v1/skill-center').json()['items'] if s['id']=='http_skill')['state'] == 'draft'
    assert c.put('/api/v1/skill-center/http_skill',json=body).status_code == 409
    c.headers.pop('x-csrf-token')
    assert c.put('/api/v1/skill-center/http_skill',json=body).status_code == 403


def test_open_task_locks_skill_workflow_and_legacy_template_routes_until_closed(portal):
    c, service, owner = portal
    response = create(c)
    task_id = response.json()['id']
    board = c.get('/api/v1/workbench').json()
    task = next(t for t in board['tasks'] if t['id']==task_id)
    skill = task['steps'][0]['skill']
    assert task_id in service.resource_locks('skill',skill)
    assert task_id in service.resource_locks('workflow',task['workflow'])
    package = next(s for s in c.get('/api/v1/skill-center').json()['items'] if s['id']==skill)
    assert any(w['id']==task['workflow'] for w in package['workflowReferences'])
    assert any(t['id']==task_id and t['name']=='支付需求' and not t['closed'] for t in package['taskReferences'])
    # Guards are shared with old configuration and template endpoints.
    definitions = c.get('/api/v1/configuration/skills').json()['items']
    entry = next(s for s in definitions if s['id']==skill)
    assert c.put('/api/v1/configuration/skills/'+skill,json={'content':entry['content'],'revision':entry['revision']}).status_code==409
    templates = c.get(f'/api/v1/configuration/skills/{skill}/templates').json()['items']
    if templates:
        template = templates[0]
        assert c.put(f'/api/v1/configuration/skills/{skill}/templates',json={'name':template['name'],'revision':template['revision'],'content':template['content']}).status_code==409
    with service.db() as db:
        db.execute("UPDATE entity SET status='completed' WHERE id=?", (task_id,))
    assert task_id in service.resource_locks('skill',skill)  # Completion is not business closure.
    package = next(s for s in c.get('/api/v1/skill-center').json()['items'] if s['id']==skill)
    assert task_id in package['lockedTasks']
    closed = action(c,task,'close',key='close-resource-test')
    assert closed.status_code==200,closed.text
    assert action(c,task,'close',key='close-resource-test').json()==closed.json()
    assert service.resource_locks('skill',skill)==[]
    assert service.resource_locks('workflow',task['workflow'])==[]
    package = next(s for s in c.get('/api/v1/skill-center').json()['items'] if s['id']==skill)
    assert any(t['id']==task_id and t['closed'] for t in package['taskReferences'])
    latest = next(t for t in c.get('/api/v1/workbench').json()['tasks'] if t['id']==task_id)
    assert latest['closedAt']
    assert c.post(f'/api/v1/tasks/{task_id}/runs',json={'expectedRevision':latest['revision']},headers={'idempotency-key':'closed-run'}).status_code==409
    # Closing retains task, attachments and audit history.
    assert latest['attachments'] and any('关闭任务' in e for e in latest['history'])


def test_enabled_skill_blocks_source_template_and_state_bypasses(portal):
    c, service, owner = portal
    source = next(item for item in c.get('/api/v1/configuration/skills').json()['items'] if item['id'] == 'test_analysis')
    identity = 'readonly_analysis'
    source_endpoint = '/api/v1/configuration/skills/' + identity
    content = source['content'].replace('id: test_analysis', 'id: ' + identity)
    copied = c.put(source_endpoint, json={'content': content, 'copyFrom': source['id']})
    assert copied.status_code == 200, copied.text
    def item():
        return next(row for row in c.get('/api/v1/skill-center').json()['items'] if row['id'] == identity)
    endpoint = '/api/v1/skill-center/' + identity + '/state'
    revision = item()['revision']
    assert c.post(endpoint, json={'action': 'validate', 'revision': revision}).json()['state'] == 'validated'
    assert c.post(endpoint, json={'action': 'publish', 'revision': revision}).json()['state'] == 'published'
    assert not item()['lockedTasks']
    template = c.get(source_endpoint + '/templates').json()['items'][0]
    template_body = {key: template[key] for key in ('name', 'content', 'revision')}
    assert c.put(source_endpoint, json={'content': content, 'revision': copied.json()['revision']}).status_code == 403
    assert c.put(source_endpoint + '/templates', json=template_body).status_code == 403
    assert c.post(endpoint, json={'action': 'validate', 'revision': revision}).status_code == 403
    raw = item()
    assert c.put('/api/v1/skill-center/' + identity, json={'content': content, 'files': raw['files'], 'state': 'draft', 'revision': revision}).status_code == 403
    assert item()['state'] == 'published'
    assert c.post(endpoint, json={'action': 'pause', 'revision': revision}).json()['state'] == 'paused'
    assert c.put(source_endpoint + '/templates', json=template_body).status_code == 200
    current = next(row for row in c.get('/api/v1/configuration/skills').json()['items'] if row['id'] == identity)
    assert c.put(source_endpoint, json={'content': content, 'revision': current['revision']}).status_code == 200


def test_default_handoff_to_empty_and_reenable(portal):
    c, service, owner = portal
    first, second = service.board(owner)['workspaces']
    first_url = f"/api/v1/workspaces/{first['id']}"
    second_url = f"/api/v1/workspaces/{second['id']}"
    edited = c.patch(second_url, json={
        'name': '其他工作空间', 'isDefault': False, 'expectedRevision': second['revision'],
    })
    assert edited.status_code == 200, edited.text
    assert service.board(owner)['defaultWorkspace'] == first['id']
    second = service.board(owner)['workspaces'][1]
    assert c.patch(second_url, json={'paused': True, 'expectedRevision': second['revision']}).status_code == 200
    assert c.patch(first_url, json={'paused': True, 'expectedRevision': first['revision']}).status_code == 200
    cleared = service.board(owner)
    assert cleared['defaultWorkspace'] == ''
    assert all(w['paused'] for w in cleared['workspaces'])
    assert c.patch(second_url, json={'paused': False, 'expectedRevision': cleared['workspaces'][1]['revision']}).status_code == 200
    assert service.board(owner)['defaultWorkspace'] == second['id']
