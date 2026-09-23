"""Authenticated adapters shared by UI and future conversation tools."""
from fastapi import APIRouter, Request
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict
from beivymate.documents.models import DocumentRef, KnowledgeTarget
from beivymate.identity.service import IdentityError


class Change(BaseModel):
    model_config = ConfigDict(extra='forbid')
    ref: DocumentRef
    action: str
    content: str | None = None
    target: KnowledgeTarget | None = None


class Review(BaseModel):
    model_config = ConfigDict(extra='forbid')
    approve: bool


def document_router(store, require):
    router = APIRouter(prefix='/api/v1/documents')

    def call(operation):
        try:
            return operation()
        except ValueError as exc:
            raise IdentityError(str(exc), 409) from None
        except OSError:
            raise IdentityError('文档访问失败，请检查目录权限和磁盘空间。', 503) from None

    def owner(request):
        return require(request, 'documents.manage')['user']['id']

    @router.get('')
    def documents(request: Request, task: str | None = None):
        user = owner(request)
        return {'items': call(lambda: store.list(user, task))}

    @router.get('/knowledge-candidates')
    def candidates(request: Request):
        user = owner(request)
        return {'items': call(lambda: store.knowledge_candidates(user))}

    @router.post('/knowledge-candidates/{identity}')
    def review(identity: str, body: Review, request: Request):
        user = owner(request)
        return {'status': call(lambda: store.review_knowledge(user, identity, actor=user, approve=body.approve))}

    @router.get('/{identity}/history')
    def history(identity: str, request: Request):
        user = owner(request)
        return {'items': call(lambda: store.history(user, identity))}

    @router.get('/{identity}/content')
    def content(identity: str, revision: int, sha256: str, request: Request):
        user = owner(request)
        ref = call(lambda: DocumentRef(id=identity,revision=revision,sha256=sha256))
        data = call(lambda: store.read(user, ref))
        filename = call(lambda: store.filename(user, ref))
        return Response(data, media_type='application/octet-stream', headers={'Content-Disposition': f'attachment; filename="{filename}"'})

    @router.get('/{identity}/text')
    def text(identity: str, revision: int, sha256: str, request: Request):
        user = owner(request)
        return {'content':call(lambda: store.read(user, DocumentRef(id=identity,revision=revision,sha256=sha256)).decode('utf-8'))}

    @router.post('/actions')
    def action(body: Change, request: Request):
        user = owner(request)
        def perform():
            if body.action == 'edit':
                if body.content is None:raise ValueError('缺少文档内容')
                if not store.filename(user,body.ref).endswith(('.md','.txt','.json')):
                    raise ValueError('此格式请编辑文件后导入，不能使用文本接口覆盖')
                return {'ref':store.edit(user,body.ref,body.content.encode(),actor=user).model_dump()}
            if body.action == 'import-file':
                return {'ref':store.import_file(user,body.ref,user).model_dump()}
            if body.action == 'confirm':store.confirm(user,body.ref,user)
            elif body.action == 'publish':return {'path':store.publish_asset(user,body.ref,user)}
            elif body.action == 'restore-publication':return store.restore_publication(user,body.ref,user)
            elif body.action == 'retire':store.retire(user,body.ref,user)
            elif body.action == 'propose-knowledge':
                if body.target is None:raise ValueError('缺少知识适用范围')
                return {'id':store.propose_knowledge(user,body.ref,body.target,user)}
            else:raise ValueError('文档操作无效')
            return {'status':'ok'}
        return call(perform)

    return router
