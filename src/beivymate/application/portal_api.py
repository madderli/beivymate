"""HTTP adapters for M03 planning. Runtime execution is deliberately not invoked."""
import json
from urllib.parse import quote
from fastapi import APIRouter, Request
from fastapi.responses import Response
from starlette.datastructures import UploadFile
from pydantic import ValidationError
from beivymate.identity.service import IdentityError
from beivymate.portal.service import MAX_FILE


def portal_router(service, require):
    router = APIRouter(prefix='/api/v1')

    def call(operation):
        try:
            return operation()
        except ValidationError:
            raise IdentityError('配置字段不完整或格式不正确，请检查必填项与标识。', 422) from None
        except OSError:
            raise IdentityError('配置文件访问失败，请检查目录权限和磁盘空间。保存结果待核实，请恢复后刷新确认。', 503) from None

    async def body(request):
        try:
            data = await request.json()
        except (ValueError, UnicodeError):
            raise IdentityError('请求内容不是有效配置。', 422) from None
        if not isinstance(data, dict):
            raise IdentityError('配置必须为对象。', 422)
        return data

    @router.get('/workbench')
    def workbench(request: Request):
        user = require(request, 'workbench.read')['user']['id']
        return call(lambda: service.board(user))

    @router.post('/workspaces', status_code=201)
    async def create_workspace(request: Request):
        user = require(request, 'workspace.write')['user']['id']
        data = await body(request)
        return call(lambda: service.workspace(user, data))

    @router.patch('/workspaces/{id}')
    async def update_workspace(id: str, request: Request):
        user = require(request, 'workspace.write')['user']['id']
        data = await body(request)
        return call(lambda: service.workspace(user, data, id))

    @router.post('/tasks', status_code=201)
    async def create_task(request: Request):
        user = require(request, 'task.create')['user']['id']
        async with request.form(max_files=5, max_fields=20, max_part_size=150000) as form:
            fields = {}
            files = []
            for key, value in form.multi_items():
                if isinstance(value, UploadFile):
                    if key != 'attachments':
                        raise IdentityError('附件字段不正确。', 422)
                    content = await value.read(MAX_FILE + 1)
                    files.append((value.filename, content))
                else:
                    if key in fields:
                        raise IdentityError('表单字段重复。', 422)
                    fields[key] = value
            try:
                fields['relatedWorkspaces'] = json.loads(fields.get('relatedWorkspaces', '[]'))
            except (TypeError, ValueError):
                raise IdentityError('关联工作区格式不正确。', 422) from None
            return call(lambda: service.create_task(user, fields, files, request.headers.get('idempotency-key')))

    @router.patch('/tasks/{id}')
    async def update_task(id: str, request: Request):
        user = require(request, 'task.manage')['user']['id']
        data = await body(request)
        return call(lambda: service.update_task(user, id, data))

    @router.post('/tasks/{id}/actions')
    async def action(id: str, request: Request):
        data = await body(request)
        user = require(request, 'task.delete' if data.get('action') == 'delete' else 'task.manage')['user']['id']
        return call(lambda: service.action(user, id, data, request.headers.get("idempotency-key")))

    @router.get('/tasks/{id}/attachments/{attachment}')
    def download(id: str, attachment: str, request: Request):
        user = require(request, 'task.read')['user']['id']
        name, content = service.attachment(user, id, attachment)
        return Response(content, media_type='application/octet-stream', headers={
            'Content-Disposition': "attachment; filename*=UTF-8''" + quote(name, safe=''),
            'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        })

    return router
