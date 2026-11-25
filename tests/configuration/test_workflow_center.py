"""Workflow authoring uses real HTTP, disk definitions and local publication records."""
import pytest
from tests.configuration.test_skill_authoring import api, model, draft


def definition(skill='meeting-notes'):
    return dict(name='会议整理流程',description='整理记录并核对行动项',icon='📝',roles=['tester'],confirmation='human',inputRequirements='',steps=[dict(id='first',skill=skill,model='default',confirmation='inherit',inputs=['task'],outputRequirements='')])


def prepare(c):
    model(c)
    response=c.put('/api/v1/skill-authoring',json=draft())
    assert response.status_code==200,response.text
    item=response.json()
    for action in ('validate','publish'):
        response=c.post('/api/v1/skill-authoring/meeting-notes/state',json={'action':action,'revision':item['revision']})
        assert response.status_code==200,response.text
        item=response.json()


def test_persistence_enable_pause_and_conflict(api):
    c,app,owner=api;prepare(c)
    response=c.post('/api/v1/workflow-center',json={'definition':definition()})
    assert response.status_code==200,response.text
    item=response.json();identity=item['id']
    assert item['state']=='draft'
    projection=app.state.workflow_center.root/(identity+'.md')
    assert not projection.exists()
    checked=c.post(f'/api/v1/workflow-center/{identity}/actions',json={'action':'validate','revision':item['revision']})
    assert checked.status_code==200,checked.text
    assert checked.json()['state']=='validated',checked.text
    assert not projection.exists()
    enabled=c.post(f'/api/v1/workflow-center/{identity}/actions',json={'action':'enable','revision':item['revision']})
    assert enabled.status_code==200,enabled.text
    assert enabled.json()['state']=='published',enabled.text
    from beivymate.configuration.loader import load_workflow_definition
    flow=load_workflow_definition(projection)
    assert flow.input_requirements==''
    assert flow.resolved_steps()[0].output_requirements==''
    assert c.put(f'/api/v1/workflow-center/{identity}',json={'definition':definition(),'revision':item['revision']}).status_code==403
    assert c.request('DELETE',f'/api/v1/workflow-center/{identity}',json={'revision':item['revision']}).status_code==403
    paused=c.post(f'/api/v1/workflow-center/{identity}/actions',json={'action':'pause','revision':item['revision']})
    assert paused.status_code==200,paused.text
    assert not projection.exists()
    assert c.get('/api/v1/workflow-center').json()['items'][0]['state']=='paused'
    assert c.put(f'/api/v1/workflow-center/{identity}',json={'definition':definition(),'revision':'stale'}).status_code==409


def test_automatic_previous_step_and_strategy_validation(api):
    c,app,owner=api;prepare(c)
    value=definition();value['steps'].append(dict(id='second',skill='meeting-notes',inputs=['task','step:first']))
    result=c.post('/api/v1/workflow-center',json={'definition':value});assert result.status_code==200,result.text
    item=result.json();identity=item['id']
    checked=c.post(f'/api/v1/workflow-center/{identity}/actions',json={'action':'validate','revision':item['revision']}).json()
    assert checked['state']=='validated',checked
    assert checked['steps'][1]['inputs']==['task']
    from beivymate.configuration.loader import load_workflow_definition
    steps=load_workflow_definition(app.state.workflow_center.path(identity)).resolved_steps()
    assert steps[0].previous_step is None
    assert steps[1].previous_step == 'first'
    assert steps[1].inputs == ['requirement']
    value['steps'][0]['analysisStrategy']='deep'
    item=c.put(f'/api/v1/workflow-center/{identity}',json={'definition':value,'revision':item['revision']}).json()
    checked=c.post(f'/api/v1/workflow-center/{identity}/actions',json={'action':'enable','revision':item['revision']}).json()
    assert checked['state']=='invalid' and checked['errors']
    assert not app.state.workflow_center._projection(identity).exists()
    value['roles']=['operations']
    assert c.post('/api/v1/workflow-center',json={'definition':value}).status_code==422


def test_unauthenticated_workflow_access(api):
    c,app,owner=api
    c.cookies.clear()
    assert c.get('/api/v1/workflow-center').status_code==401


def test_task_lock_covers_completed_but_not_closed(api):
    c,app,owner=api;prepare(c)
    item=c.post('/api/v1/workflow-center',json={'definition':definition()}).json()
    identity=item['id']
    workspace = c.post('/api/v1/workspaces', json={'shortName': 'WS', 'name': '工作空间'}).json()['id']
    response=c.post('/api/v1/tasks',data={'title':'引用任务','workspace':workspace,'workflow':'uat','description':'需求','version':'1','environment':'uat','locale':'zh-CN','relatedWorkspaces':'[]'},files=[('attachments',('需求.md','资料'.encode(),'text/markdown'))],headers={'idempotency-key':'workflow-lock'})
    assert response.status_code==201,response.text
    tid=response.json()['id']
    with app.state.portal.db() as db:
        db.execute('INSERT INTO resource_reference VALUES (?,?,?)',(tid,'workflow',identity))
        db.execute("UPDATE entity SET status='completed' WHERE id=?",(tid,))
    assert c.put(f'/api/v1/workflow-center/{identity}',json={'definition':definition(),'revision':item['revision']}).status_code==409
    assert c.post(f'/api/v1/workflow-center/{identity}/actions',json={'action':'pause','revision':item['revision']}).status_code==409
    assert c.request('DELETE',f'/api/v1/workflow-center/{identity}',json={'revision':item['revision']}).status_code==409


def test_disabled_model_is_not_validated(api):
    c,app,owner=api;prepare(c)
    value=definition();value['steps'][0]['model']='not-a-model'
    item=c.post('/api/v1/workflow-center',json={'definition':value}).json()
    response=c.post(f"/api/v1/workflow-center/{item['id']}/actions",json={'action':'enable','revision':item['revision']})
    assert response.status_code==200,response.text
    assert response.json()['state']=='invalid'
    assert response.json()['errors']


def test_reject_task_specific_requirements_and_preserve_legacy(api):
    c,app,owner=api;prepare(c)
    value=definition();value['inputRequirements']='本次只测试 HIS 门诊'
    assert c.post('/api/v1/workflow-center',json={'definition':value}).status_code==422
    value=definition();value['steps'][0]['outputRequirements']='保存到客户目录'
    assert c.post('/api/v1/workflow-center',json={'definition':value}).status_code==422
    value=definition()
    item=c.post('/api/v1/workflow-center',json={'definition':value}).json()
    service=app.state.workflow_center
    from beivymate.workflows.service import Definition
    old=definition();old['inputRequirements']='旧输入说明';old['steps'][0]['outputRequirements']='旧输出说明'
    path=service.path(item['id']);raw=service.markdown(item['id'],Definition.model_validate(old)).encode();path.write_bytes(raw)
    legacy=c.get('/api/v1/workflow-center').json()['items'][0]
    assert legacy['legacyRequirements']
    saved=c.put('/api/v1/workflow-center/'+item['id'],json={'definition':value,'revision':legacy['revision']})
    assert saved.status_code==200,saved.text
    assert not saved.json()['legacyRequirements']
    history=service.directory/'.history'/item['id']/(legacy['revision']+'.md')
    assert history.read_bytes()==raw


def test_builtin_icon_catalog_and_saved_icons(api):
    c,app,owner=api;prepare(c)
    workflow_icons=c.get('/api/v1/workflow-center/options').json()['icons']
    skill_icons=c.get('/api/v1/skill-authoring/options').json()['icons']
    assert len(set(workflow_icons))==len(workflow_icons)==10
    assert len(set(skill_icons))==len(skill_icons)==10
    assert all(v.startswith('wf:') for v in workflow_icons)
    assert all(v.startswith('sk:') for v in skill_icons)
    value=definition();value['icon']=workflow_icons[0]
    item=c.post('/api/v1/workflow-center',json={'definition':value}).json()
    assert item['icon']==workflow_icons[0]
    skill=c.put('/api/v1/skill-authoring',json={**draft(),'id':'icon-example','icon':skill_icons[0]})
    assert skill.status_code==200,skill.text
    assert skill.json()['icon']==skill_icons[0]
    # Existing emoji are accepted without rewriting saved packages.
    assert c.get('/api/v1/skill-authoring/meeting-notes').json()['icon']=='📝'


def test_step_supplement_round_trips_into_execution_definition(api):
    client, app, _ = api
    prepare(client)
    value = definition()
    note = '按深入方式分析。\n重点核对重复提交。'
    value['steps'][0]['supplement'] = note
    response = client.post('/api/v1/workflow-center', json={'definition': value})
    assert response.status_code == 200, response.text
    item = response.json()
    assert item['steps'][0]['supplement'] == note
    from beivymate.configuration.loader import load_workflow_definition
    flow = load_workflow_definition(app.state.workflow_center.path(item['id']))
    assert flow.resolved_steps()[0].supplement == note


def test_invalid_step_field_identifies_location(api):
    client, _, _ = api
    value = definition()
    value['steps'][0]['supplement'] = '字' * 101
    response = client.post('/api/v1/workflow-center', json={'definition': value})
    assert response.status_code == 422
    assert '第1步：补充说明：最多允许 100 个字符' in response.json()['message']
