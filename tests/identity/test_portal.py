from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import sqlite3

from fastapi.testclient import TestClient
import pytest

from beivymate.application.web import create_app, COOKIE
from beivymate.identity.service import IdentityService, IdentityError

PASSWORD = 'Test-password-long-123!'
ORIGIN = {'origin': 'http://127.0.0.1:5173'}


@pytest.fixture
def portal(tmp_path):
    app = create_app(tmp_path, 'local-setup-secret')
    with TestClient(app, base_url='http://127.0.0.1:8000', headers=ORIGIN) as client:
        yield client, app, tmp_path


def initialize(client):
    r = client.post('/api/v1/account/initialize', json={
        'username': 'tester', 'password': PASSWORD, 'name': '测试工程师',
        'setupToken': 'local-setup-secret', 'role': 'tester'})
    assert r.status_code == 201, r.text
    return r.json()['recoveryCode']


def login(client):
    r = client.post('/api/v1/session', json={'username':'tester', 'password':PASSWORD, 'role':'tester'})
    assert r.status_code == 200, r.text
    return {'x-csrf-token': r.json()['csrfToken']}


def test_real_initialization_login_logout_restart(portal):
    client, app, path = portal
    assert client.get('/api/v1/session').json()['needsInitialization']
    assert client.get('/api/v1/workbench').status_code == 401
    code = initialize(client)
    csrf = login(client)
    cookie = client.cookies.get(COOKIE)
    state = client.get('/api/v1/session').json()
    assert state['user']['id'] and state['entitlement']['features'] == ['*']
    assert 'task.execute' not in state['capabilities']
    assert client.get('/api/v1/workbench').json()['tasks'] == []
    restarted = IdentityService(path/'identity.sqlite3', 'new-bootstrap')
    assert restarted.session(cookie)['user']['id'] == state['user']['id']
    assert client.delete('/api/v1/session', headers=csrf).status_code == 200
    assert not restarted.session(cookie)['authenticated']
    raw = (path/'identity.sqlite3').read_bytes()
    assert PASSWORD.encode() not in raw and code.encode() not in raw and cookie.encode() not in raw


def test_origin_csrf_role_and_secret_redaction(portal):
    client, _, _ = portal
    assert client.post('/api/v1/account/initialize', headers={'origin':'https://evil.example'}, json={}).status_code == 403
    initialize(client)
    r = client.post('/api/v1/session', json={'username':'tester','password':PASSWORD,'role':'developer'})
    assert r.status_code == 422
    login(client)
    assert client.delete('/api/v1/session').status_code == 403
    assert client.delete('/api/v1/session', headers={'x-csrf-token':'bad'}).status_code == 403
    r = client.post('/api/v1/session',json={'username':'tester','password':PASSWORD,'extra':'secret-value'})
    assert r.status_code == 422 and PASSWORD not in r.text and 'secret-value' not in r.text
    assert client.get('/api/v1/session',headers={'host':'evil.example'}).status_code == 400


def test_recovery_rotates_code_and_invalidates_sessions(portal):
    client, _, _ = portal
    code = initialize(client)
    login(client)
    body = {'username':'tester','recoveryCode':code,'password':'Replacement-password-456!'}
    r = client.post('/api/v1/account/recover',json=body)
    assert r.status_code == 200 and r.json()['recoveryCode'] != code
    assert not client.get('/api/v1/session').json()['authenticated']
    assert client.post('/api/v1/account/recover',json=body).status_code == 401
    assert client.post('/api/v1/session',json={'username':'tester','password':body['password']}).status_code == 200


def test_password_change_requires_current_and_revokes(portal):
    client, _, _ = portal
    initialize(client)
    csrf = login(client)
    body = {'currentPassword':'wrong-password','newPassword':'Replacement-password-456!'}
    assert client.post('/api/v1/account/password',headers=csrf,json=body).status_code == 403
    body['currentPassword']=PASSWORD
    assert client.post('/api/v1/account/password',headers=csrf,json=body).status_code == 200
    assert client.get('/api/v1/workbench').status_code == 401


def test_rate_limit_persists_after_restart(portal):
    client, app, path = portal
    initialize(client)
    for _ in range(5):
        assert client.post('/api/v1/session',json={'username':'tester','password':'wrong'}).status_code == 401
    restarted = IdentityService(path/'identity.sqlite3','unused')
    with pytest.raises(IdentityError) as error:
        restarted.login('tester', PASSWORD)
    assert error.value.status == 429
    restarted.clock=lambda:app.state.identity.clock()+301
    assert restarted.login('tester',PASSWORD)


def test_single_account_atomic_and_session_expiry(tmp_path):
    service=IdentityService(tmp_path/'identity.sqlite3','setup')
    def create():
        try:
            service.initialize('tester',PASSWORD,'Tester','setup')
            return 201
        except IdentityError as e:
            return e.status
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(lambda _:create(),range(2))) == [201,409]
    token=service.login('tester',PASSWORD)
    now=service.clock()
    service.clock=lambda:now+service.session_seconds+1
    assert not service.session(token)['authenticated']


def test_credential_adapter_receives_stable_identity_without_echo(tmp_path):
    class Vault:
        def save(self,*args): self.args=args
        def delete(self,*args): self.deleted=args
    vault=Vault()
    with TestClient(create_app(tmp_path,'local-setup-secret',vault=vault),base_url='http://127.0.0.1:8000',headers=ORIGIN) as client:
        initialize(client);csrf=login(client)
        r=client.put('/api/v1/account/credentials/company',headers=csrf,json={'secret':'example-secret'})
        assert r.status_code==200 and 'example-secret' not in r.text
        assert vault.args[0]==client.get('/api/v1/session').json()['user']['id']
        assert client.delete('/api/v1/account/credentials/company',headers=csrf).status_code==200
        assert vault.deleted==vault.args[:2]


def test_no_plaintext_keyring_fallback(monkeypatch):
    from beivymate.identity.credentials import CredentialVault
    monkeypatch.setattr('keyring.get_keyring',lambda:object())
    with pytest.raises(IdentityError) as e:
        CredentialVault().save('user','company','secret')
    assert e.value.status==503


def test_name_change_preserves_identity_and_entitlement(portal):
    client, _, _ = portal
    initialize(client); csrf=login(client)
    before=client.get('/api/v1/session').json()
    assert client.patch('/api/v1/account/profile',headers=csrf,json={'name':'新名字'}).status_code==200
    after=client.get('/api/v1/session').json()
    assert before['user']['id']==after['user']['id'] and after['user']['name']=='新名字'
    assert before['entitlement']==after['entitlement']


def test_entitlement_cannot_grant_unimplemented_features_and_can_expire():
    from beivymate.identity.access import AccessPolicy
    assert 'task.execute' not in AccessPolicy().capabilities(0)
    assert AccessPolicy(expires_at=100).capabilities(100)==['account.manage']
    limited=AccessPolicy(features=frozenset({'workbench.read'}))
    assert limited.capabilities(0)==['account.manage','workbench.read']


@pytest.mark.parametrize('username', ['employee@example.com', '8', '员工甲', 'EMP/042'])
def test_email_employee_id_and_unicode_username(tmp_path, username):
    service = IdentityService(tmp_path/'identity.sqlite3', 'setup')
    service.initialize(username, PASSWORD, '员工', 'setup')
    assert service.session(service.login(username, PASSWORD))['authenticated']


@pytest.mark.parametrize('password', ['Short1!', 'all-lowercase-123!', 'ALL-UPPERCASE-123!', 'NoDigitsHere!!', 'NoSymbolsHere123', 'With Spaces123!'])
def test_new_password_policy_rejects_weak_passwords(tmp_path, password):
    service = IdentityService(tmp_path/'identity.sqlite3', 'setup')
    with pytest.raises(IdentityError, match='大写字母'):
        service.initialize('employee@example.com', password, '员工', 'setup')
    assert not service.initialized()


@pytest.mark.parametrize('mode, expected_status', [
    ('absent', 200), ('success', 200), ('delete_failure', 503), ('read_failure', 503),
])
def test_credential_delete_reports_actual_outcome(tmp_path, monkeypatch, mode, expected_status):
    from beivymate.identity.credentials import CredentialVault
    from keyring.errors import PasswordDeleteError

    class Backend:
        deleted = False

        def get_password(self, service, account):
            if mode == 'read_failure':
                raise RuntimeError('private backend diagnostic')
            return None if mode == 'absent' else 'private-secret'

        def delete_password(self, service, account):
            if mode == 'delete_failure':
                raise PasswordDeleteError('private backend diagnostic')
            self.deleted = True

    backend = Backend()
    monkeypatch.setattr(CredentialVault, '_backend', lambda self: backend)
    with TestClient(create_app(tmp_path, 'local-setup-secret'),
                    base_url='http://127.0.0.1:8000', headers=ORIGIN) as client:
        initialize(client)
        csrf = login(client)
        response = client.delete('/api/v1/account/credentials/company', headers=csrf)
        assert response.status_code == expected_status
        assert backend.deleted == (mode == 'success')
        assert 'private' not in response.text
        if expected_status == 503:
            assert 'deleted' not in response.json()
        else:
            assert response.json() == {'deleted': True}


def test_logout_audit_is_bound_to_authenticated_identity(portal):
    client, app, path = portal
    initialize(client)
    csrf = login(client)
    token = client.cookies.get(COOKIE)
    uid = client.get('/api/v1/session').json()['user']['id']
    assert client.delete('/api/v1/session', headers=csrf).status_code == 200
    # Retrying an already revoked or unknown token creates no unattributed event.
    app.state.identity.logout(token)
    app.state.identity.logout('unknown-token')
    with sqlite3.connect(path/'identity.sqlite3') as db:
        events = db.execute("SELECT actor FROM audit WHERE action='session.logout'").fetchall()
        assert events == [(uid,)]
        assert db.execute('SELECT count(*) FROM session').fetchone()[0] == 0
