"""Authenticated HTTP commands; never execute a model in an HTTP request."""
from fastapi import APIRouter, Request
from beivymate.identity.service import IdentityError
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, ValidationError


class RunCommand(BaseModel):
    model_config = ConfigDict(extra='forbid')
    action: Literal['start', 'pause', 'resume', 'stop', 'approved', 'rejected', 'supply_execution']
    subjectHash: str | None = Field(default=None, pattern=r'^[a-f0-9]{64}$')
    comment: str = Field(default='', max_length=4000)
    round: int | None = Field(default=None, ge=1, strict=True)


def run_router(service, require):
    router = APIRouter(prefix='/api/v1')

    async def body(request):
        try:
            value = await request.json()
        except ValueError:
            raise IdentityError('请求格式不正确', 422) from None
        if not isinstance(value, dict):
            raise IdentityError('请求必须是对象', 422)
        return value

    @router.post('/tasks/{task}/runs', status_code=202)
    async def start(task: str, request: Request):
        owner = require(request, 'task.execute')['user']['id']
        data = await body(request)
        return service.create(owner, task, request.headers.get('idempotency-key'), data.get('expectedRevision'))

    @router.get('/tasks/{task}/runs')
    def history(task: str, request: Request):
        owner = require(request, 'task.read')['user']['id']
        return service.list(owner, task)

    @router.get('/runs/{identity}')
    def detail(identity: str, request: Request):
        owner = require(request, 'task.read')['user']['id']
        return service.detail(owner, identity)

    @router.post('/runs/{identity}/commands', status_code=202)
    async def command(identity: str, request: Request):
        owner = require(request, 'task.execute')['user']['id']
        try:
            data = RunCommand.model_validate(await body(request)).model_dump(exclude_none=True)
            return service.command(owner, identity, data, request.headers.get('idempotency-key'))
        except ValidationError:
            raise IdentityError('运行操作字段格式不正确', 422) from None
        except (ValueError, OSError) as exc:
            raise IdentityError(str(exc), 422) from None

    @router.get('/notifications')
    def notifications(request: Request):
        return service.notifications(require(request, 'workbench.read')['user']['id'])

    @router.post('/notifications/{event}/read')
    def read(event: int, request: Request):
        service.acknowledge(require(request, 'workbench.read')['user']['id'], event)
        return {'saved': True}


    @router.get('/preferences/output')
    def output_preferences(request: Request):
        require(request, 'account.manage')
        from hashlib import sha256
        from beivymate.markdown.metadata import read_markdown
        path = service.root / 'configuration/preferences.md'
        raw = path.read_bytes() if path.exists() else b''
        settings = read_markdown(path)[0] if raw else {}
        return {'outputDirectory': settings.get('outputDirectory', ''), 'revision': sha256(raw).hexdigest()}

    @router.put('/preferences/output')
    async def save_output(request: Request):
        require(request, 'account.manage')
        data = await body(request)
        value = data.get('outputDirectory', '')
        if not isinstance(value, str) or len(value) > 2000:
            raise IdentityError('目录格式不正确', 422)
        from beivymate.documents.paths import output_root
        from beivymate.scheduling.locking import exclusive_file
        from beivymate.markdown.metadata import read_markdown
        from hashlib import sha256
        import json, os, tempfile
        path = service.root / 'configuration/preferences.md'
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            if value:
                output_root(service.root / 'work/documents/deliverables', user=value)
            with exclusive_file(path.with_suffix('.lock')):
                raw = path.read_bytes() if path.exists() else b''
                if data.get('revision') != sha256(raw).hexdigest():
                    raise IdentityError('个人配置已被修改，请重新加载并核对', 409)
                settings, content = read_markdown(path) if raw else ({}, '')
                settings['outputDirectory'] = value
                text = '---\n' + ''.join(f'{key}: {json.dumps(item, ensure_ascii=False)}\n' for key, item in settings.items()) + '---\n' + content
                fd, temporary = tempfile.mkstemp(dir=path.parent)
                try:
                    with os.fdopen(fd, 'w', encoding='utf-8') as stream:
                        stream.write(text); stream.flush(); os.fsync(stream.fileno())
                    os.replace(temporary, path)
                finally:
                    from pathlib import Path
                    Path(temporary).unlink(missing_ok=True)
        except (OSError, ValueError) as exc:
            raise IdentityError('目录配置保存失败：' + str(exc), 422) from None
        return output_preferences(request)

    return router
