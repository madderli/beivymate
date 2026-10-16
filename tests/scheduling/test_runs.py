import json
import time
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from beivymate.application.web import create_app
from beivymate.runtime.llm.gateway import LLMGateway
from beivymate.runtime.llm.models import LLMResponse
from beivymate.model.artifact.requirement_understanding import UnderstandingData
from beivymate.model.artifact.test_analysis import AnalysisData
from beivymate.runtime.checkpoint import Checkpoint

class Provider:
    def __init__(self): self.calls = 0
    def chat(self, request):
        self.calls += 1
        cls = UnderstandingData if request.response_schema.get('title') == 'UnderstandingData' else AnalysisData
        data = {name: {'status': 'not_provided', 'reason': '未提供'} for name in cls.model_fields if name != 'unknowns'}
        data['unknowns'] = []
        return LLMResponse(model='offline', content=json.dumps(data))

@pytest.fixture
def app(tmp_path, monkeypatch):
    provider = Provider()
    def gateway(*args, **kwargs):
        value = LLMGateway(provider)
        value.configuration_binding = dict(provider='ollama', base_url='http://offline', timeout=1)
        return value
    monkeypatch.setattr('beivymate.application.run_inputs.create_gateway', gateway)
    monkeypatch.setattr('beivymate.application.app.create_gateway', gateway)
    app = create_app(tmp_path, 'setup', worker_enabled=False)
    app.state.provider = provider
    return app

@pytest.fixture
def client(app):
    with TestClient(app, base_url='http://127.0.0.1:8000', headers={'origin': 'http://127.0.0.1:5173'}) as c:
        assert c.post('/api/v1/account/initialize', json={'username':'tester','name':'测试员','password':'Secure-Password-123!','setupToken':'setup'}).status_code == 201
        login = c.post('/api/v1/session', json={'username':'tester','password':'Secure-Password-123!'}).json()
        c.headers['x-csrf-token'] = login['csrfToken']
        c.post('/api/v1/workspaces', json={'id':'product','name':'产品'})
        yield c

def task(c, key='task'):
    response = c.post('/api/v1/tasks', data={'title':'支付需求', 'workspace':'product', 'workflow':'m6_test_analysis',
        'description':'支付成功更新订单', 'version':'1'}, headers={'idempotency-key':key})
    assert response.status_code == 201, response.text
    return next(t for t in c.get('/api/v1/workbench').json()['tasks'] if t['id'] == response.json()['id'])

def prepare(c, t, key='prepare'):
    response = c.post(f"/api/v1/tasks/{t['id']}/runs", json={'expectedRevision':t['revision']}, headers={'idempotency-key': key})
    assert response.status_code == 202, response.text
    return response.json()['id']

def command(c, run, action, **kwargs):
    import uuid
    return c.post(f'/api/v1/runs/{run}/commands', json={'action':action, **kwargs}, headers={'idempotency-key':str(uuid.uuid4())})

def test_real_http_runtime_review_snapshot_and_notifications(client, app):
    c = client; t = task(c); run = prepare(c, t)
    assert prepare(c, t) == run
    assert app.state.provider.calls == 0
    detail = c.get('/api/v1/runs/'+run).json()
    assert detail['status'] == 'prepared' and detail['outputDirectory']
    # A customer edit after preparation must not replace the snapshot.
    config = Path(t['configPath'])
    config.write_text(config.read_text().replace('支付成功更新订单', '修改后的需求'))
    assert command(c, run, 'start').status_code == 202
    app.state.runs.tick()
    detail = c.get('/api/v1/runs/'+run).json()
    assert detail['status'] == 'waiting_review'
    assert detail['reviewSubject'] and detail['snapshot']['task']['description'] == '支付成功更新订单'
    assert command(c, run, 'approved', subjectHash='a'*64).status_code == 409
    assert command(c, run, 'approved', subjectHash=detail['subjectHash']).status_code == 202
    app.state.runs.tick()
    detail = c.get('/api/v1/runs/'+run).json()
    assert detail['index'] == 1 and detail['status'] == 'waiting_review'
    command(c, run, 'approved', subjectHash=detail['subjectHash'])
    app.state.runs.tick()
    assert c.get('/api/v1/runs/'+run).json()['status'] == 'completed'
    assert app.state.provider.calls == 2
    notices = c.get('/api/v1/notifications').json()
    assert [n['status'] for n in notices] == ['completed','waiting_review','waiting_review']
    assert len(c.get('/api/v1/notifications').json()) == 3
    assert c.post(f"/api/v1/notifications/{notices[0]['id']}/read").status_code == 200
    assert len(c.get('/api/v1/notifications').json()) == 2

def test_pause_stop_and_active_task_protection(client, app):
    t = task(client); run = prepare(client, t)
    assert client.patch('/api/v1/tasks/'+t['id'], json={'expectedRevision':t['revision'],'title':'changed'}).status_code == 200
    assert client.post('/api/v1/tasks/'+t['id']+'/actions',json={'action':'delete','expectedRevision':t['revision']},headers={'idempotency-key':'delete'}).status_code == 409
    command(client, run, 'start')
    command(client, run, 'pause')
    assert not app.state.runs.tick()
    command(client, run, 'resume')
    app.state.runs.tick()
    command(client, run, 'stop')
    assert client.get('/api/v1/runs/'+run).json()['status'] == 'stopped'
    assert app.state.provider.calls == 1

def test_interrupted_execution_is_not_replayed(client, app):
    run = prepare(client, task(client))
    state = Checkpoint.load(app.state.runs.path(run))
    state.status = 'executing'; state.write(app.state.runs.path(run))
    with app.state.runs.db() as db:
        db.execute("UPDATE runs SET status='running' WHERE id=?", (run,))
    app.state.runs.recover()
    assert client.get('/api/v1/runs/'+run).json()['status'] == 'uncertain'
    assert not app.state.runs.tick()
    assert command(client, run, 'resume').status_code == 409
    assert app.state.provider.calls == 0

def test_worker_continues_after_logout(client, app):
    run = prepare(client, task(client))
    command(client, run, 'start')
    client.delete('/api/v1/session')
    app.state.runs.start()
    try:
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if app.state.provider.calls: break
            time.sleep(.02)
        assert app.state.provider.calls == 1
        assert client.get('/api/v1/runs/'+run).status_code == 401
    finally:
        app.state.runs.close()

def test_owner_boundary_and_workspace_queue(client, app):
    t = task(client); run = prepare(client, t)
    command(client, run, 'start')
    ws = client.get('/api/v1/workbench').json()['workspaces'][0]
    client.patch('/api/v1/workspaces/product',json={'expectedRevision':ws['revision'],'paused':True})
    assert not app.state.runs.tick()
    from beivymate.identity.service import IdentityError
    with pytest.raises(IdentityError):
        app.state.runs.detail('another-user', run)
    assert app.state.runs.notifications('another-user') == []


def test_waiting_review_releases_slot_and_notifications_are_independent(client, app):
    first = prepare(client, task(client, 'first'), 'prepare-first')
    second = prepare(client, task(client, 'second'), 'prepare-second')
    command(client, first, 'start'); command(client, second, 'start')
    assert app.state.runs.tick()
    assert client.get('/api/v1/runs/'+first).json()['status'] == 'waiting_review'
    assert app.state.runs.tick()
    assert client.get('/api/v1/runs/'+second).json()['status'] == 'waiting_review'
    assert app.state.provider.calls == 2
    assert {n['run'] for n in client.get('/api/v1/notifications').json()} == {first, second}


def test_safe_pause_during_model_call_and_restart_waiting_review(client, app):
    import threading
    entered, release = threading.Event(), threading.Event()
    provider = app.state.provider
    original = provider.chat
    def delayed(request):
        entered.set()
        assert release.wait(5)
        return original(request)
    provider.chat = delayed
    run = prepare(client, task(client))
    command(client, run, 'start')
    worker = threading.Thread(target=app.state.runs.tick)
    worker.start()
    try:
        assert entered.wait(5)
        assert command(client, run, 'pause').status_code == 202
        assert client.get('/api/v1/runs/'+run).json()['control'] == 'pause'
    finally:
        release.set(); worker.join(5)
    assert client.get('/api/v1/runs/'+run).json()['status'] == 'paused'
    from beivymate.scheduling.service import RunService
    old = app.state.runs
    restored = RunService(old.root, old.portal, old.prepare, old.restore)
    restored.recover()
    restored.command(client.get('/api/v1/session').json()['user']['id'], run, {'action':'resume'}, 'resume-after-restart')
    restored.tick()
    assert client.get('/api/v1/runs/'+run).json()['status'] == 'waiting_review'
    assert provider.calls == 1


def test_directory_precedence_conflicts_and_frozen_root(client, app, tmp_path):
    prefs = client.get('/api/v1/preferences/output').json()
    personal = str(tmp_path/'personal')
    assert client.put('/api/v1/preferences/output',json={**prefs,'outputDirectory':personal}).status_code == 200
    assert client.put('/api/v1/preferences/output',json={**prefs,'outputDirectory':personal}).status_code == 409
    ws = client.get('/api/v1/workbench').json()['workspaces'][0]
    client.patch('/api/v1/workspaces/product',json={'expectedRevision':ws['revision'],'outputDirectory':str(tmp_path/'workspace')})
    t = task(client)
    client.patch('/api/v1/tasks/'+t['id'],json={'expectedRevision':t['revision'],'outputDirectory':str(tmp_path/'task')})
    t = client.get('/api/v1/workbench').json()['tasks'][0]
    run = prepare(client, t)
    assert client.get('/api/v1/runs/'+run).json()['outputDirectory'] == str((tmp_path/'task').resolve())
    prefs = client.get('/api/v1/preferences/output').json()
    client.put('/api/v1/preferences/output',json={**prefs,'outputDirectory':str(tmp_path/'changed')})
    assert client.get('/api/v1/runs/'+run).json()['outputDirectory'] == str((tmp_path/'task').resolve())


def test_execution_only_waits_for_real_results_without_model(client, app):
    t = task(client)
    assert client.patch('/api/v1/tasks/'+t['id'],json={'expectedRevision':t['revision'], 'workflow':'m8_test_execution'}).status_code == 200
    t = client.get('/api/v1/workbench').json()['tasks'][0]
    run = prepare(client, t)
    command(client, run, 'start')
    app.state.runs.tick()
    detail = client.get('/api/v1/runs/'+run).json()
    assert detail['status'] == 'waiting_input'
    assert '手工' in detail['error'] and app.state.provider.calls == 0
    assert command(client, run, 'supply_execution', round=999).status_code == 422
    assert client.get('/api/v1/runs/'+run).json()['status'] == 'waiting_input'


def test_automatic_workflow_and_strategy_fallback(client, app):
    path = app.state.runs.root / 'configuration/workflows/automatic.md'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('---\nid: automatic\nname: 自动理解\n---\n\n## 步骤：understand\n- 技能：requirement_understand\n- 输入：requirement\n- 执行授权：自动\n')
    original = app.state.provider.chat
    def complete(request):
        reply = original(request)
        value = json.loads(reply.content)
        value['objective_scope'] = {'status':'provided','items':[{'text':'支付成功','basis':'explicit','source_refs':['requirement:'+t['group']]}]}
        reply.content = json.dumps(value)
        return reply
    app.state.provider.chat = complete
    t = task(client)
    client.patch('/api/v1/tasks/'+t['id'],json={'expectedRevision':t['revision'],'workflow':'automatic','reviewMode':'auto','analysisStrategy':'deep'})
    t = client.get('/api/v1/workbench').json()['tasks'][0]
    run = prepare(client,t)
    state = Checkpoint.load(app.state.runs.path(run))
    assert state.workflow.resolved_steps()[0].review_mode == 'auto'
    command(client,run,'start')
    app.state.runs.tick()
    # The executor itself decides whether automatic acceptance is safe.
    state = Checkpoint.load(app.state.runs.path(run))
    assert state.status == 'ready'
    app.state.runs.tick()
    assert client.get('/api/v1/runs/'+run).json()['status'] == 'completed'
    assert len(client.get('/api/v1/notifications').json()) == 1


def test_restart_does_not_apply_an_already_persisted_approval_twice(client, app):
    run = prepare(client, task(client))
    command(client, run, 'start'); app.state.runs.tick()
    detail = client.get('/api/v1/runs/'+run).json()
    command(client, run, 'approved', subjectHash=detail['subjectHash'])
    state = Checkpoint.load(app.state.runs.path(run))
    from beivymate.runtime.checkpoint import Decision
    owner = client.get('/api/v1/session').json()['user']['id']
    subject = detail['reviewSubject']
    state.decisions.append(Decision(step_id='understand',phase='review',decision='approved',
        mode='manual',actor=owner,subject_hash=state.subject_hash,artifact_id=subject['id'],artifact_revision=subject['revision']))
    state.index = 1; state.status = 'ready'; state.write(app.state.runs.path(run))
    with app.state.runs.db() as db:
        db.execute("UPDATE runs SET status='running' WHERE id=?", (run,))
    app.state.runs.recover()
    app.state.runs.tick()
    detail = client.get('/api/v1/runs/'+run).json()
    assert detail['status'] == 'waiting_review' and detail['index'] == 1
    assert len([d for d in detail['decisions'] if d['phase'] == 'review']) == 1


def test_frozen_run_survives_invalid_current_workflow_and_task_markdown(client, app):
    t = task(client)
    path = app.state.runs.root / 'configuration/workflows/customer.md'
    path.parent.mkdir(parents=True, exist_ok=True)
    original = app.state.portal.workflow_root / 'm6_test_analysis.md'
    path.write_text(original.read_text().replace('id: m6_test_analysis', 'id: customer'))
    client.patch('/api/v1/tasks/'+t['id'],json={'expectedRevision':t['revision'],'workflow':'customer'})
    t = client.get('/api/v1/workbench').json()['tasks'][0]
    run = prepare(client,t)
    path.write_text('invalid workflow')
    Path(t['configPath']).write_text('invalid task')
    command(client,run,'start')
    app.state.runs.tick()
    detail = client.get('/api/v1/runs/'+run).json()
    assert detail['status'] == 'waiting_review'
    assert detail['snapshot']['task']['workflow'] == 'customer'


def test_missing_checkpoint_remains_visible_without_breaking_workbench(client, app):
    run = prepare(client,task(client))
    command(client,run,'start')
    with app.state.runs.db() as db:
        db.execute("UPDATE runs SET status='running' WHERE id=?", (run,))
    app.state.runs.path(run).unlink()
    app.state.runs.recover()
    assert client.get('/api/v1/runs/'+run).json()['status'] == 'uncertain'
    assert client.get('/api/v1/workbench').status_code == 200
    assert client.get('/api/v1/notifications').json()[0]['status'] == 'uncertain'
    assert command(client, run, 'resume').status_code == 409


def test_completed_task_cannot_prepare_another_run(client, app):
    t = task(client)
    run = prepare(client, t)
    assert command(client, run, 'start').status_code == 202
    for _ in range(10):
        app.state.runs.tick()
        detail = client.get('/api/v1/runs/' + run).json()
        if detail['status'] == 'completed':
            break
        if detail['status'] in ('waiting_review', 'waiting_authorization'):
            assert command(client, run, 'approved', subjectHash=detail['subjectHash']).status_code == 202
    assert detail['status'] == 'completed'
    latest = next(x for x in client.get('/api/v1/workbench').json()['tasks'] if x['id'] == t['id'])
    response = client.post(f"/api/v1/tasks/{t['id']}/runs", json={'expectedRevision': latest['revision']}, headers={'idempotency-key': 'new-run-after-completion'})
    assert response.status_code == 409
    assert '已完成任务不能重新执行' in response.json()['message']
    # A repeat of the original idempotent request still returns its original run.
    assert prepare(client, t) == run
