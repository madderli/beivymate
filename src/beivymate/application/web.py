"""M02 HTTP composition root. Run: python -m beivymate.application.web."""
import argparse
from pathlib import Path
import secrets

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.trustedhost import TrustedHostMiddleware

from beivymate.identity.service import IdentityError, IdentityService
from beivymate.identity.credentials import CredentialVault

COOKIE = 'beivymate_session'


class Login(BaseModel):
    model_config = ConfigDict(extra='forbid')
    username: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=256, repr=False)
    role: str = 'tester'


class Initialize(Login):
    name: str = Field(min_length=1, max_length=80)
    setupToken: str = Field(min_length=1, max_length=256, repr=False)


class Recover(BaseModel):
    model_config = ConfigDict(extra='forbid')
    username: str = Field(min_length=1, max_length=254)
    recoveryCode: str = Field(min_length=1, max_length=256, repr=False)
    password: str = Field(min_length=1, max_length=256, repr=False)


class PasswordChange(BaseModel):
    model_config = ConfigDict(extra='forbid')
    currentPassword: str = Field(min_length=1, max_length=256, repr=False)
    newPassword: str = Field(min_length=1, max_length=256, repr=False)


class Profile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=80)


class Credential(BaseModel):
    model_config = ConfigDict(extra='forbid')
    secret: str = Field(min_length=1, max_length=8192, repr=False)


def create_app(data_dir: Path, setup_token: str, *, origins=None, vault=None, workflow_root=None):
    service = IdentityService(data_dir / 'identity.sqlite3', setup_token)
    vault = vault or CredentialVault()
    from beivymate.portal.service import PortalService
    from beivymate.application.portal_api import portal_router
    portal = PortalService(data_dir / 'work', workflow_root or Path(__file__).resolve().parents[3] / 'resources/configuration/workflow')
    allowed_origins = set(origins or [
        f'http://{host}:{port}' for host in ('127.0.0.1', 'localhost')
        for port in (8000, 5173, 4173)
    ])
    app = FastAPI(title='BeIvyMate local portal', docs_url=None, redoc_url=None, openapi_url=None)
    app.state.identity = service
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=['127.0.0.1', 'localhost'])

    @app.exception_handler(IdentityError)
    async def identity_error(request, exc):
        return JSONResponse({'message': str(exc)}, status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        # FastAPI's default validation body may echo passwords. Never return inputs.
        return JSONResponse({'message': '请求字段不完整或格式不正确。'}, status_code=422)

    @app.middleware('http')
    async def boundary(request: Request, call_next):
        if request.method not in ('GET', 'HEAD', 'OPTIONS'):
            if request.headers.get('origin') not in allowed_origins:
                return JSONResponse({'message': '请求来源未获允许。'}, status_code=403)
            if request.headers.get('sec-fetch-site') == 'cross-site':
                return JSONResponse({'message': '不接受跨站操作。'}, status_code=403)
            if request.url.path == '/api/v1/tasks' and request.method == 'POST':
                try:
                    service.require(request.cookies.get(COOKIE), request.headers.get('x-csrf-token', ''), 'task.create')
                except IdentityError as exc:
                    return JSONResponse({'message': str(exc)}, status_code=exc.status)
            total = 0
            chunks = []
            async for chunk in request.stream():
                total += len(chunk)
                if total > (101 * 1024 * 1024 if request.url.path == '/api/v1/tasks' and request.method == 'POST' else 256 * 1024):
                    return JSONResponse({'message': '请求过大。'}, status_code=413)
                chunks.append(chunk)
            request._body = b''.join(chunks)
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'no-referrer'
        return response

    def require(request, capability):
        return service.require(request.cookies.get(COOKIE),
            request.headers.get('x-csrf-token', '') if request.method != 'GET' else None,
            capability)

    from beivymate.configuration.library import ConfigurationLibrary
    library = ConfigurationLibrary(Path(__file__).resolve().parents[3] / 'resources', data_dir / 'configuration')
    app.state.configuration_library = library
    portal.custom_workflow_root = data_dir / 'configuration/workflows'

    @app.get('/api/v1/configuration/{kind}')
    def configurations(kind: str, request: Request):
        require(request, 'configuration.manage')
        try:
            return {'items': library.list(kind)}
        except (ValueError, OSError) as exc:
            raise IdentityError(str(exc), 422) from None

    @app.put('/api/v1/configuration/{kind}/{identity}')
    async def save_configuration(kind: str, identity: str, request: Request):
        require(request, 'configuration.manage')
        try:
            body = await request.json()
            if not isinstance(body, dict) or set(body) - {'content', 'revision', 'copyFrom'} or not isinstance(body.get('content'), str):
                raise ValueError('配置请求格式不正确')
            return library.save(kind, identity, body['content'], body.get('revision'), copy_from=body.get('copyFrom'))
        except PermissionError as exc:
            raise IdentityError(str(exc), 403) from None
        except FileExistsError as exc:
            raise IdentityError(str(exc), 409) from None
        except (ValueError, OSError) as exc:
            raise IdentityError(str(exc), 422) from None

    from beivymate.documents.service import DocumentStore
    from beivymate.application.document_api import document_router
    app.state.documents = DocumentStore(data_dir / 'work' / 'documents')
    app.include_router(document_router(app.state.documents, require))

    @app.get('/api/v1/configuration/skills/{identity}/templates')
    def templates(identity: str, request: Request):
        require(request, 'configuration.manage')
        try:
            return {'items': library.templates(identity)}
        except (ValueError, OSError) as exc:
            raise IdentityError(str(exc), 422) from None

    @app.put('/api/v1/configuration/skills/{identity}/templates')
    async def save_template(identity: str, request: Request):
        require(request, 'configuration.manage')
        import base64
        try:
            body = await request.json()
            if not isinstance(body, dict) or set(body) != {'name', 'content', 'revision'} or not all(isinstance(value,str) for value in body.values()):
                raise ValueError('模板请求格式不正确')
            return library.save_template(identity,body['name'],base64.b64decode(body['content'],validate=True),body['revision'])
        except PermissionError as exc:
            raise IdentityError(str(exc),403) from None
        except FileExistsError as exc:
            raise IdentityError(str(exc),409) from None
        except (ValueError, OSError) as exc:
            raise IdentityError(str(exc),422) from None

    @app.get('/api/v1/session')
    def session(request: Request):
        return service.session(request.cookies.get(COOKIE))

    @app.post('/api/v1/account/initialize', status_code=201)
    def initialize(body: Initialize):
        if body.role != 'tester':
            raise IdentityError('当前只提供测试工程师角色。', 422)
        return {'recoveryCode': service.initialize(body.username, body.password, body.name, body.setupToken)}

    @app.post('/api/v1/session')
    def login(body: Login, request: Request):
        if body.role != 'tester':
            raise IdentityError('当前只提供测试工程师角色。', 422)
        token = service.login(body.username, body.password)
        service.logout(request.cookies.get(COOKIE)) if request.cookies.get(COOKIE) else None
        response = JSONResponse(service.session(token))
        response.set_cookie(COOKIE, token, max_age=service.session_seconds,
            httponly=True, samesite='strict', secure=request.url.scheme == 'https', path='/api')
        return response

    @app.delete('/api/v1/session')
    def logout(request: Request):
        require(request, 'account.manage')
        service.logout(request.cookies.get(COOKIE))
        response = JSONResponse({'loggedOut': True})
        response.delete_cookie(COOKIE, path='/api')
        return response

    @app.post('/api/v1/account/recover')
    def recover(body: Recover):
        return {'recoveryCode': service.recover(body.username, body.recoveryCode, body.password)}

    @app.post('/api/v1/account/password')
    def password(body: PasswordChange, request: Request):
        require(request, 'account.manage')
        service.change_password(request.cookies[COOKIE], body.currentPassword, body.newPassword)
        response = JSONResponse({'loginRequired': True})
        response.delete_cookie(COOKIE, path='/api')
        return response

    @app.patch('/api/v1/account/profile')
    def profile(body: Profile, request: Request):
        require(request, 'account.manage')
        service.rename(request.cookies[COOKIE], body.name)
        return {'saved': True}

    @app.put('/api/v1/account/credentials/{connection}')
    def save_credential(connection: str, body: Credential, request: Request):
        account = require(request, 'credentials.manage')
        if not connection.isascii() or not connection.replace('-', '').replace('_', '').isalnum() or len(connection) > 80:
            raise IdentityError('连接标识只支持字母、数字、短横线、下划线，最多 80 字符。', 422)
        vault.save(account['user']['id'], connection, body.secret)
        return {'saved': True}

    @app.delete('/api/v1/account/credentials/{connection}')
    def delete_credential(connection: str, request: Request):
        account = require(request, 'credentials.manage')
        vault.delete(account['user']['id'], connection)
        return {'deleted': True}

    app.include_router(portal_router(portal, require))
    app.state.portal = portal
    return app


def main():
    parser = argparse.ArgumentParser(description='BeIvyMate local personal portal')
    from beivymate.documents.defaults import data_directory
    parser.add_argument('--data-dir', type=Path, default=data_directory())
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    token = secrets.token_urlsafe(24)
    origins = [f'http://{h}:{p}' for h in ('127.0.0.1', 'localhost') for p in (args.port, 5173, 4173)]
    app = create_app(args.data_dir, token, origins=origins)
    if not app.state.identity.initialized():
        print(f'首次账户初始化码（仅本机使用）：{token}', flush=True)
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=args.port, access_log=False)


if __name__ == '__main__':
    main()
