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
    app = create_app(tmp_path, 'setup')
    with TestClient(app, base_url='http://127.0.0.1:8000', headers={'origin':'http://127.0.0.1:5173'}) as c:
        assert c.post('/api/v1/account/initialize',json={'username':'tester','password':'Secure-Password-123!','name':'测试人员','setupToken':'setup'}).status_code==201
        session = c.post('/api/v1/session',json={'username':'tester','password':'Secure-Password-123!'}).json()
        c.headers['x-csrf-token']=session['csrfToken']
        for id in ('HIS','CIS'):
            assert c.post('/api/v1/workspaces',json={'id':id,'name':id+'产品','knowledge':'公司共享资料','project':'试点项目'}).status_code==201
        yield c, app.state.portal, session['user']['id']


def create(c, *, related=None, key='create-key', **changes):
    data={'title':'支付需求','workspace':'HIS','workflow':'uat','description':'验证支付','version':'1','environment':'uat','locale':'zh-CN','relatedWorkspaces':json.dumps(related or [])}
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
    assert c.patch('/api/v1/workspaces/HIS',json={'name':'旧页面','expectedRevision':ws['revision']}).status_code==409


def test_pause_resume_preserves_tasks_and_unique_ids(portal):
    c, service, _ = portal
    create(c,related=['CIS'])
    main, child=c.get('/api/v1/workbench').json()['tasks']
    assert action(c,main,'start').status_code==409
    assert action(c,main,'pause','pause-key').status_code==200
    assert action(c,main,'pause','pause-key').status_code==200
    main=c.get('/api/v1/workbench').json()['tasks'][0]
    ws=c.get('/api/v1/workbench').json()['workspaces'][0]
    assert c.patch('/api/v1/workspaces/HIS',json={'paused':True,'expectedRevision':ws['revision']}).status_code==409
    # Historical paused workspaces must still reject new work and support reenable.
    with service.db() as db:
        db.execute("UPDATE entity SET status='paused' WHERE id='HIS'")
    assert action(c,main,'resume').status_code==409
    assert create(c,key='paused-new').status_code==409
    assert action(c,main,'delete').status_code==409
    assert action(c,child,'delete').status_code==409
    assert action(c,main,'delete').status_code==409
    assert len(c.get('/api/v1/workbench').json()['tasks'])==2
    assert c.delete('/api/v1/workspaces/HIS').status_code==405
    ws=c.get('/api/v1/workbench').json()['workspaces'][0]
    c.patch('/api/v1/workspaces/HIS',json={'paused':False,'expectedRevision':ws['revision']})
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
    _, service, owner = portal
    fields={'title':'需求','workspace':'HIS','workflow':'uat','description':'正文','version':'1','environment':'uat'}
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
    assert before['defaultWorkspace'] == 'HIS'
    ws = next(w for w in before['workspaces'] if w['id'] == 'CIS')
    response = c.patch('/api/v1/workspaces/CIS', json={
        'isDefault': True, 'expectedRevision': ws['revision']})
    assert response.status_code == 200, response.text
    assert c.get('/api/v1/workbench').json()['defaultWorkspace'] == 'CIS'
    assert c.patch('/api/v1/workspaces/CIS', json={
        'isDefault': True, 'expectedRevision': ws['revision']}).status_code == 409
    owner = c.get('/api/v1/session').json()['user']['id']
    reopened = PortalService(service.root, ROOT)
    assert reopened.board(owner)['defaultWorkspace'] == 'CIS'
    assert reopened.board('another-user')['defaultWorkspace'] == ''
    assert c.patch('/api/v1/workspaces/missing', json={'isDefault': True}).status_code == 404


def test_workspace_multi_value_roundtrip_and_legacy_compatibility(portal):
    c, service, owner = portal
    old = c.get('/api/v1/workbench').json()['workspaces'][0]
    assert old['projects'] == ['试点项目']
    assert old['knowledgeDirectories'] == ['公司共享资料']
    payload = dict(id='LAB', name='检验协同', description='检验需求\n跨项目协同',
                   products=['LIS', 'CIS'], projects=['一期', '二期'],
                   knowledgeDirectories=['/docs/需求', 'C:\\Knowledge\\Manuals'], isDefault=True)
    assert c.post('/api/v1/workspaces', json=payload).status_code == 201
    board = PortalService(service.root, ROOT).board(owner)
    workspace = next(w for w in board['workspaces'] if w['id'] == 'LAB')
    for key in ('description', 'products', 'projects', 'knowledgeDirectories'):
        assert workspace[key] == payload[key]
    assert workspace['product'] == 'LIS'
    assert board['defaultWorkspace'] == 'LAB'
    payload['id'] = 'BAD'
    payload['products'] = ['LIS', ' LIS ']
    assert c.post('/api/v1/workspaces', json=payload).status_code == 422


def test_workspace_configuration_locked_by_unfinished_tasks(portal):
    c, _, _ = portal
    assert create(c).status_code == 201
    workspace = c.get('/api/v1/workbench').json()['workspaces'][0]
    for changes in [{'name': '不能更改'}, {'id': 'NEW'}, {'isDefault': True}, {'products': ['CIS']}]:
        response = c.patch('/api/v1/workspaces/HIS', json={**changes, 'expectedRevision': workspace['revision']})
        assert response.status_code == 409
        assert '未完成任务' in response.json()['message']
    assert c.get('/api/v1/workbench').json()['workspaces'][0]['name'] == workspace['name']


def test_workspace_rename_preserves_completed_tasks_and_can_rename_back(portal):
    c, service, owner = portal
    assert create(c, related=['CIS']).status_code == 201
    with service.db() as db:
        db.execute("UPDATE entity SET status='completed' WHERE kind='task'")
    board = c.get('/api/v1/workbench').json()
    workspace = board['workspaces'][0]
    original_task = board['tasks'][0]
    response = c.patch('/api/v1/workspaces/HIS', json=dict(id='HOSPITAL', name='医院协同',
        products=['HIS', 'CIS'], projects=['新项目'], knowledgeDirectories=['/docs/new'],
        description='新版工作区', isDefault=True, expectedRevision=workspace['revision']))
    assert response.status_code == 200, response.text
    board = PortalService(service.root, ROOT).board(owner)
    task = next(t for t in board['tasks'] if t['id'] == original_task['id'])
    assert task['workspace'] == 'HOSPITAL'
    assert task['group'] == original_task['group']
    assert task['attachments'] == original_task['attachments']
    assert board['defaultWorkspace'] == 'HOSPITAL'
    assert not Path(workspace['configPath']).exists()
    current = next(w for w in board['workspaces'] if w['id'] == 'HOSPITAL')
    assert c.patch('/api/v1/workspaces/HOSPITAL', json={'id': 'HIS', 'expectedRevision': current['revision']}).status_code == 200
    board = c.get('/api/v1/workbench').json()
    assert board['defaultWorkspace'] == 'HIS'
    assert board['tasks'][0]['workspace'] == 'HIS'
    assert c.patch('/api/v1/workspaces/HIS', json={'name':'旧草稿', 'expectedRevision':workspace['revision']}).status_code == 409


def test_workspace_rename_recovers_journal_after_interrupted_flush(portal, monkeypatch):
    _, service, owner = portal
    workspace = service.board(owner)['workspaces'][0]
    original_flush = service._flush
    calls = 0

    def interrupt(db):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError('simulated interruption after database commit')
        original_flush(db)

    monkeypatch.setattr(service, '_flush', interrupt)
    with pytest.raises(OSError):
        service.workspace(owner, {'id': 'HOSPITAL', 'expectedRevision': workspace['revision']}, 'HIS')
    monkeypatch.setattr(service, '_flush', original_flush)
    board = service.board(owner)
    assert board['defaultWorkspace'] == 'HOSPITAL'
    assert any(w['id'] == 'HOSPITAL' for w in board['workspaces'])
    assert not Path(workspace['configPath']).exists()
    assert (service.configs / 'workspace' / 'HOSPITAL.md').exists()



def test_workspace_disable_rechecks_pending_and_reenable_preserves_configuration(portal):
    c, _, _ = portal
    workspace = c.get('/api/v1/workbench').json()['workspaces'][0]
    assert c.patch('/api/v1/workspaces/HIS', json={'paused': True, 'expectedRevision':workspace['revision']}).status_code == 200
    disabled = c.get('/api/v1/workbench').json()['workspaces'][0]
    assert disabled['paused'] is True
    assert disabled['name'] == workspace['name']
    assert create(c).status_code == 409
    assert c.patch('/api/v1/workspaces/HIS', json={'paused': False, 'expectedRevision': disabled['revision']}).status_code == 200
    assert create(c).status_code == 201
    current = c.get('/api/v1/workbench').json()['workspaces'][0]
    response = c.patch('/api/v1/workspaces/HIS', json={'paused': True, 'expectedRevision': current['revision']})
    assert response.status_code == 409
    assert '未完成任务' in response.json()['message']
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
    assert c.put('/api/v1/skill-center/test_analysis',json=body).status_code == 403
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
    closed = action(c,task,'close',key='close-resource-test')
    assert closed.status_code==200,closed.text
    assert action(c,task,'close',key='close-resource-test').json()==closed.json()
    assert service.resource_locks('skill',skill)==[]
    assert service.resource_locks('workflow',task['workflow'])==[]
    latest = next(t for t in c.get('/api/v1/workbench').json()['tasks'] if t['id']==task_id)
    assert latest['closedAt']
    assert c.post(f'/api/v1/tasks/{task_id}/runs',json={'expectedRevision':latest['revision']},headers={'idempotency-key':'closed-run'}).status_code==409
    # Closing retains task, attachments and audit history.
    assert latest['attachments'] and any('关闭任务' in e for e in latest['history'])
