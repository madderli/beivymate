"""Authenticated skill creation endpoints; no legacy import handlers are changed."""
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, Response
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool
from beivymate.identity.service import IdentityError
from beivymate.configuration.skill_authoring import ASSETS


def authoring_router(authoring, require):
    router = APIRouter(prefix='/api/v1/skill-authoring')

    async def invoke(request, operation, body=False):
        owner = require(request, 'configuration.manage')['user']['id']
        try:
            payload = await request.json() if body else None
            return await run_in_threadpool(operation, owner, payload)
        except PermissionError as exc:
            raise IdentityError(str(exc), 403) from None
        except FileExistsError as exc:
            raise IdentityError(str(exc), 409) from None
        except ValidationError:
            raise IdentityError('技能字段格式不正确或超过长度限制，请检查后重试', 422) from None
        except (ValueError, OSError, RuntimeError) as exc:
            raise IdentityError(str(exc), 422) from None

    @router.get('/options')
    async def options(request: Request):
        return await invoke(request, lambda owner, _: authoring.options())

    @router.post('/identifier')
    async def identifier(request: Request):
        return await invoke(request, lambda owner, b: authoring.identifier(b.get('name') if isinstance(b, dict) else None), True)

    @router.post('/identifier/check')
    async def check_identifier(request: Request):
        return await invoke(request, lambda owner, b: authoring.check_identifier(
            b.get('id') if isinstance(b, dict) else None, b.get('revision') if isinstance(b, dict) else None), True)

    @router.get('/documents/{name}')
    def document(name: str, request: Request):
        require(request, 'configuration.manage')
        if name == 'navigation.js':
            return Response((ASSETS / name).read_bytes(), media_type='text/javascript')
        if name in ('guide.md', 'example.md'):
            return Response((ASSETS / name).read_bytes(), media_type='text/markdown',
                            headers={'Content-Disposition': f'attachment; filename="skill-writing-{name}"'})
        if name not in ('guide', 'example'):
            raise IdentityError('文档不存在', 404)
        return HTMLResponse((ASSETS / f'{name}.html').read_text(encoding='utf-8'), headers={
            'Content-Security-Policy': "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"})

    @router.get('/{identity}')
    async def get(identity: str, request: Request):
        return await invoke(request, lambda owner, _: authoring.get(identity))

    @router.put('')
    async def save(request: Request):
        return await invoke(request, authoring.save, True)

    @router.post('/{identity}/state')
    async def transition(identity: str, request: Request):
        def change(owner, body):
            if not isinstance(body, dict) or set(body) - {'action', 'revision'}:
                raise ValueError('状态操作格式无效')
            return authoring.transition(owner, identity, body.get('action'), body.get('revision'))
        return await invoke(request, change, True)

    return router
