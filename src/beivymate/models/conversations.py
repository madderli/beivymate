"""Local read-only chat, with per-conversation model inheritance and durable messages."""
import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from fastapi import APIRouter, Request
from starlette.concurrency import run_in_threadpool
from beivymate.identity.service import IdentityError
from beivymate.runtime.llm.models import LLMRequest, ChatMessage


class Conversations:
    def __init__(self,root,catalog,portal):
        self.path=root/'work/conversations.sqlite3'
        self.catalog,self.portal=catalog,portal
        with self.db() as db:
            db.executescript('''CREATE TABLE IF NOT EXISTS preference(owner TEXT,context TEXT,model TEXT,PRIMARY KEY(owner,context));
                CREATE TABLE IF NOT EXISTS message(id TEXT PRIMARY KEY,owner TEXT,context TEXT,role TEXT,text TEXT,model TEXT,created TEXT);
                CREATE TABLE IF NOT EXISTS submission(owner TEXT,key TEXT,context TEXT,signature TEXT,status TEXT,result TEXT,PRIMARY KEY(owner,key));
                CREATE UNIQUE INDEX IF NOT EXISTS chat_active ON submission(owner,context) WHERE status='pending';''')
            # An interrupted network request must never be automatically replayed.
            db.execute("UPDATE submission SET status='uncertain' WHERE status='pending'")
        self.path.chmod(0o600)

    @contextmanager
    def db(self):
        with sqlite3.connect(self.path,timeout=15) as db:
            db.row_factory=sqlite3.Row
            db.execute('BEGIN IMMEDIATE')
            yield db

    def context(self,owner,context):
        if context=='global':
            return '普通工作协助；没有指定任务，不声称已创建或修改任务。'
        board=self.portal.board(owner)
        if hasattr(self.portal,'runs'):
            board=self.portal.runs.project_board(owner,board)
        prefix,_,identity=context.partition(':')
        if prefix=='workspace':
            value=next((w for w in board['workspaces'] if w['id']==identity),None)
        elif prefix=='task':
            value=next((t for t in board['tasks'] if t['id']==identity),None)
        else:
            value=None
        if value is None:
            raise IdentityError('对话所属任务或工作区不存在',404)
        return json.dumps({k:value.get(k) for k in ('id','name','title','description','status','closedAt','paused')},ensure_ascii=False)

    def messages(self,owner,context):
        self.context(owner,context)
        with self.db() as db:
            return [dict(r) for r in db.execute('SELECT id,role,text,model FROM message WHERE owner=? AND context=? ORDER BY rowid',(owner,context))]

    def selection(self,owner,context,model=None,save=False):
        self.context(owner,context)
        if save:
            if not isinstance(model,str):
                raise ValueError('模型选择无效')
            if model:
                self.catalog.snapshot(owner,purpose='chat',selection=model,required=['text'])
            with self.db() as db:
                db.execute('INSERT OR REPLACE INTO preference VALUES (?,?,?)',(owner,context,model))
        with self.db() as db:
            row=db.execute('SELECT model FROM preference WHERE owner=? AND context=?',(owner,context)).fetchone()
            return {'model':row[0] if row else ''}

    def send(self,owner,context,body,key):
        if not key or len(key)>160 or not isinstance(body,dict):
            raise ValueError('发送消息需要有效提交标识')
        text=body.get('text')
        if not isinstance(text,str) or not text.strip() or len(text)>20000:
            raise ValueError('消息不能为空或超过 20000 字')
        if body.get('model') is not None and not isinstance(body.get('model'),str):
            raise ValueError('模型选择无效')
        live=self.context(owner,context)
        selection=body.get('model') if body.get('model') is not None else self.selection(owner,context)['model']
        import hashlib
        signature=hashlib.sha256(json.dumps([context,text,selection],ensure_ascii=False).encode()).hexdigest()
        with self.db() as db:
            old=db.execute('SELECT * FROM submission WHERE owner=? AND key=?',(owner,key)).fetchone()
            if old:
                if old['signature']!=signature:
                    raise IdentityError('同一提交标识对应的消息不同',409)
                if old['status']=='done':
                    return json.loads(old['result'])
                raise IdentityError('该请求已发送，结果待核实或失败；请检查记录后重新提交，不能自动重放',409)
            history=[ChatMessage(role=r['role'],content=r['text']) for r in db.execute('SELECT role,text FROM message WHERE owner=? AND context=? ORDER BY rowid',(owner,context))]
            if sum(len(m.content) for m in history)+len(text)>100000:
                raise ValueError('对话过长，请整理输入后使用新的任务或工作区对话')
            try:
                db.execute('INSERT INTO submission VALUES (?,?,?,?,?,?)',(owner,key,context,signature,'pending',''))
            except sqlite3.IntegrityError:
                raise IdentityError('该对话已有消息正在处理，请稍后再试',409) from None
        try:
            gateway,model=self.catalog.gateway(owner,purpose='chat',selection=selection or None,required=['text'])
            system='你是本地任务助手。仅解释和建议，不能执行工具或修改任务；不要声称已完成任何操作。聊天补充资料尚未登记为任务输入时，应提示用户通过任务表单登记。当前可信状态：'+live
            response=gateway.chat(LLMRequest(model=model,messages=[ChatMessage(role='system',content=system),*history,ChatMessage(role='user',content=text)],max_output_tokens=2000))
            result={'id':str(uuid.uuid4()),'role':'assistant','text':response.content,'model':response.model}
            with self.db() as db:
                now=datetime.now(timezone.utc).isoformat()
                db.execute('INSERT INTO message VALUES (?,?,?,?,?,?,?)',(str(uuid.uuid4()),owner,context,'user',text,'',now))
                db.execute('INSERT INTO message VALUES (?,?,?,?,?,?,?)',(result['id'],owner,context,'assistant',response.content,response.model,now))
                db.execute("UPDATE submission SET status='done',result=? WHERE owner=? AND key=?",(json.dumps(result,ensure_ascii=False),owner,key))
            return result
        except Exception:
            with self.db() as db:
                db.execute("UPDATE submission SET status='failed' WHERE owner=? AND key=?",(owner,key))
            raise


def conversation_router(service,require):
    router=APIRouter(prefix='/api/v1/conversations')
    async def call(request,operation):
        owner=require(request,'chat')['user']['id']
        try:
            return await run_in_threadpool(operation,owner)
        except (ValueError,RuntimeError) as exc:
            raise IdentityError(str(exc),422) from None

    @router.get('/{context}/messages')
    async def messages(context:str,request:Request):
        return await call(request,lambda owner:service.messages(owner,context))

    async def payload(request):
        try: return await request.json()
        except ValueError: raise IdentityError('请求不是有效 JSON',422) from None

    @router.post('/{context}/messages')
    async def send(context:str,request:Request):
        body=await payload(request)
        return await call(request,lambda owner:service.send(owner,context,body,request.headers.get('idempotency-key')))

    @router.get('/{context}/model')
    async def model(context:str,request:Request):
        return await call(request,lambda owner:service.selection(owner,context))

    @router.put('/{context}/model')
    async def select(context:str,request:Request):
        body=await payload(request)
        return await call(request,lambda owner:service.selection(owner,context,body.get('model') if isinstance(body,dict) else None,True))
    return router
