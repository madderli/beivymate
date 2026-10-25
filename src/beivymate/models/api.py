"""Model-management HTTP adapters; all probes execute outside the UI process."""
from fastapi import APIRouter, Request
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool
from beivymate.identity.service import IdentityError


def model_router(catalog, require):
    router=APIRouter(prefix='/api/v1/models')

    async def invoke(request, operation, *, body=False):
        owner=require(request,'configuration.manage')['user']['id']
        try:
            payload=await request.json() if body else None
            return await run_in_threadpool(operation,owner,payload)
        except FileExistsError as exc:
            raise IdentityError(str(exc),409) from None
        except ValidationError:
            raise IdentityError('模型字段格式不正确，请检查地址、模型 ID、能力及默认设置',422) from None
        except (ValueError,RuntimeError,OSError) as exc:
            raise IdentityError(str(exc),422) from None

    @router.get('')
    async def view(request: Request):
        return await invoke(request,lambda owner,_:catalog.view(owner))

    @router.put('')
    async def save(request: Request):
        return await invoke(request,lambda owner,body:catalog.save(owner,body),body=True)

    @router.put('/services/{identity}/credential')
    async def credential(identity: str,request: Request):
        return await invoke(request,lambda owner,b:catalog.credential(owner,identity,b.get('secret') if isinstance(b,dict) else None),body=True)

    @router.delete('/services/{identity}/credential')
    async def remove_credential(identity: str,request: Request):
        return await invoke(request,lambda owner,_:catalog.delete_credential(owner,identity))

    @router.post('/services/{identity}/discover')
    async def discover(identity: str,request: Request):
        return await invoke(request,lambda owner,_:catalog.discover(owner,identity))

    @router.post('/connection/discover')
    async def discover_connection(request: Request):
        def operation(owner,b):
            if not isinstance(b,dict) or not isinstance(b.get('service'),dict) or not isinstance(b.get('secret',''),str):
                raise ValueError('连接信息格式不正确')
            return catalog.discover_connection(owner,b['service'],b.get('secret'))
        return await invoke(request,operation,body=True)

    @router.post('/{identity}/test')
    async def test(identity: str,request: Request):
        return await invoke(request,lambda owner,_:catalog.probe(owner,identity))

    @router.get('/usage')
    async def usage(request: Request):
        return await invoke(request,lambda owner,_:catalog.usage(owner))

    @router.post('/replacement-preview')
    async def replacement_preview(request: Request):
        return await invoke(request,lambda owner,b:catalog.replacements.preview(owner,b),body=True)

    @router.post('/replace')
    async def replace(request: Request):
        return await invoke(request,lambda owner,b:catalog.replacements.apply(owner,b),body=True)

    @router.get('/lifecycle')
    async def lifecycle(request: Request):
        return await invoke(request,lambda owner,_:catalog.lifecycle.report(owner))

    @router.post('/lifecycle/check')
    async def check_lifecycle(request: Request):
        def operation(owner,body):
            if not isinstance(body,dict):raise ValueError('检查参数无效')
            return catalog.lifecycle.check(owner,body.get('models'),used_only=body.get('usedOnly',False) is True)
        return await invoke(request,operation,body=True)

    @router.post('/maintenance/latest')
    async def latest(request: Request):
        return await invoke(request,lambda owner,body:catalog.lifecycle.latest(owner,body.get('source') if isinstance(body,dict) else None),body=True)

    @router.post('/maintenance/preview')
    async def maintenance_preview(request: Request):
        def operation(owner,body):
            if not isinstance(body,dict):raise ValueError('请求格式不正确')
            if body.get('action','replace') not in ('replace','delete'):raise ValueError('维护操作无效')
            source=body.get('source')
            if body.get('action')=='delete':return catalog.maintenance.preview(owner,source,action='delete')
            target,facts=catalog.lifecycle.target(owner,source,body)
            preview=catalog.maintenance.preview(owner,source,target)
            return {**preview,'targetFacts':facts,'currentFacts':catalog.lifecycle.facts(owner).get(source,{})}
        return await invoke(request,operation,body=True)

    @router.post('/maintenance/commit')
    async def maintenance_commit(request: Request):
        def operation(owner,body):
            if not isinstance(body,dict):raise ValueError('请求格式不正确')
            if body.get('action','replace') not in ('replace','delete'):raise ValueError('维护操作无效')
            source=body.get('source')
            if body.get('action')=='delete':return catalog.maintenance.apply(owner,source,body,action='delete')
            target,_=catalog.lifecycle.target(owner,source,body)
            service=next(s for s in catalog._read(owner)[0].services if s.id==target.serviceId)
            if not target.enabled or not service.enabled or not catalog._configured(service,owner):raise ValueError('目标模型未启用或缺少有效鉴权配置')
            return catalog.maintenance.apply(owner,source,body,target)
        return await invoke(request,operation,body=True)

    @router.post('/maintenance/workflows/{identity}/validate')
    async def validate_workflow_model(identity: str,request: Request):
        return await invoke(request,lambda owner,_:catalog.maintenance.workflow_publication(owner,identity))

    @router.post('/maintenance/workflows/{identity}/publish')
    async def publish_workflow_model(identity: str,request: Request):
        return await invoke(request,lambda owner,_:catalog.maintenance.workflow_publication(owner,identity,publish=True))

    @router.post('/resolve')
    async def resolve(request: Request):
        def operation(owner,b):
            if not isinstance(b,dict) or b.get('purpose','skill') not in ('chat','skill'):
                raise ValueError('用途必须为 chat 或 skill')
            snapshot=catalog.snapshot(owner,purpose=b.get('purpose','skill'),selection=b.get('selection'),required=b.get('required',[]))
            return {'modelId':snapshot['candidates'][0]['id'],'identifier':snapshot['candidates'][0]['identifier'],
                'candidates':[m['id'] for m in snapshot['candidates']]}
        return await invoke(request,operation,body=True)

    @router.post('/chat')
    async def chat(request: Request):
        def operation(owner,b):
            from beivymate.runtime.llm.models import ChatMessage, LLMRequest
            if not isinstance(b,dict) or not isinstance(b.get('text'),str) or not b['text'].strip() or len(b['text'])>20000:
                raise ValueError('请输入不超过 20000 字的测试消息')
            gateway,model=catalog.gateway(owner,purpose='chat',selection=b.get('model') or None,required=['text'])
            result=gateway.chat(LLMRequest(model=model,messages=[ChatMessage(role='user',content=b['text'])],max_output_tokens=1000))
            return {'text':result.content,'model':result.model,'events':gateway.events}
        return await invoke(request,operation,body=True)
    return router
