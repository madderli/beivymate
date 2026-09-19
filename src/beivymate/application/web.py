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


def create_app(data_dir: Path, setup_token: str, *, origins=None, vault=None):
    service = IdentityService(data_dir / 'identity.sqlite3', setup_token)
    vault = vault or CredentialVault()
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
            total = 0
            chunks = []
            async for chunk in request.stream():
                total += len(chunk)
                if total > 16384:
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

    @app.get('/api/v1/workbench')
    def workbench(request: Request):
        require(request, 'workbench.read')
        # M03 owns the business repository. No fabricated tasks or writable capabilities.
        return {'workspaces': [], 'tasks': [], 'workflows': [], 'models': []}

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

    return app


def main():
    parser = argparse.ArgumentParser(description='BeIvyMate local personal portal')
    parser.add_argument('--data-dir', type=Path, default=Path.home() / '.beivymate')
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
