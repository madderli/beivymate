"""Authenticated workflow management endpoints."""
from fastapi import APIRouter, Request
from starlette.concurrency import run_in_threadpool
from pydantic import ValidationError
from beivymate.identity.service import IdentityError


FIELD_NAMES = {
    'name': '工作流名称', 'description': '描述', 'icon': '图标',
    'roles': '适用角色', 'confirmation': '确认方式', 'steps': '技能步骤',
    'id': '步骤标识', 'skill': '技能', 'model': '模型',
    'analysisStrategy': '分析策略', 'supplement': '补充说明',
    'inputs': '输入来源', 'inputRequirements': '旧版输入要求',
    'outputRequirements': '旧版输出要求',
}


def validation_message(error):
    location = error['loc']
    prefix = ''
    if len(location) > 1 and location[0] == 'steps' and isinstance(location[1], int):
        prefix = f'第{location[1] + 1}步：'
        location = location[2:]
    field = FIELD_NAMES.get(str(location[0]), '配置字段') if location else '配置'
    kind = error['type']
    limits = error.get('ctx', {})
    if kind in ('string_too_long', 'too_long'):
        length = limits['max_length']
        reason = f'最多允许 {length} 个字符' if kind == 'string_too_long' else f'最多允许 {length} 项'
    elif kind in ('missing', 'string_too_short'):
        reason = '请填写此项'
    elif kind == 'literal_error':
        reason = '选项已失效，请重新选择'
    elif kind == 'extra_forbidden':
        reason = '当前版本不支持此字段，请刷新页面后重试'
    elif kind == 'string_pattern_mismatch':
        reason = '格式无效，请移除该步骤后重新添加'
    else:
        reason = '格式无效，请重新填写或选择'
    return f'{prefix}{field}：{reason}'


def workflow_router(workflows, require):
    router=APIRouter(prefix='/api/v1/workflow-center')

    async def invoke(request, operation, body=False):
        session=require(request,'configuration.manage')
        try:
            payload=await request.json() if body else None
            if body and not isinstance(payload,dict):raise ValueError('请求格式无效')
            return await run_in_threadpool(operation,session.get('role','tester'),session['user']['id'],payload)
        except ValidationError as exc:
            messages = (validation_message(error) for error in exc.errors(include_input=False))
            raise IdentityError('\n'.join(dict.fromkeys(messages)), 422) from None
        except FileExistsError as exc:raise IdentityError(str(exc),409) from None
        except PermissionError as exc:raise IdentityError(str(exc),403) from None
        except (ValueError,OSError,RuntimeError,KeyError) as exc:raise IdentityError(str(exc),422) from None

    @router.get('/options')
    async def options(request: Request):
        return await invoke(request,lambda role,owner,b:{'icons':['wf:branch','wf:sequence','wf:parallel','wf:cycle','wf:route','wf:check','wf:layers','wf:connect','wf:stages','wf:network']})

    @router.get('')
    async def listing(request: Request):
        return await invoke(request,lambda role,owner,b:workflows.list(role))

    @router.post('')
    async def create(request: Request):
        return await invoke(request,lambda role,owner,b:workflows.save(None,b,role,owner),True)

    @router.put('/{identity}')
    async def save(identity: str, request: Request):
        return await invoke(request,lambda role,owner,b:workflows.save(identity,b,role,owner),True)

    @router.post('/{identity}/actions')
    async def action(identity: str, request: Request):
        return await invoke(request,lambda role,owner,b:workflows.action(identity,b,role,owner),True)

    @router.delete('/{identity}')
    async def delete(identity: str, request: Request):
        return await invoke(request,lambda role,owner,b:workflows.delete(identity,b.get('revision'),role),True)

    return router
