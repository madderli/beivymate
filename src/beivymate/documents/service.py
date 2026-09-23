"""Immutable revisions in SQLite, user-visible versioned files, explicit publication."""
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
from uuid import uuid4
from beivymate.documents.models import DocumentOrigin, DocumentRef, OutputPolicy, KnowledgeTarget
from beivymate.documents.paths import output_root
from beivymate.documents.formats import validate_content


def digest(content): return hashlib.sha256(content).hexdigest()
def now(): return datetime.now(timezone.utc).isoformat()
def segment(value): return ''.join(c if c.isascii() and (c.isalnum() or c in '-_') else '_' for c in value)[:80] + '-' + digest(value.encode())[:8]


def asset_root(root, policy, origin):
    path = Path(root) / 'assets'
    if policy.scope in ('product', 'project'):
        path = path / 'products' / segment(origin.product)
        if policy.scope == 'project':
            path = path / 'projects' / segment(origin.project)
        if origin.function:
            path = path / 'functions'
            for node in origin.function_path or [origin.function]:
                path = path / segment(node)
    elif policy.scope == 'workspace':
        path = path / 'workspaces' / segment(origin.workspace)
    else:
        path = path / 'tasks' / segment(origin.task)
    return path


class DocumentStore:
    def __init__(self, directory: Path):
        self.directory = output_root(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.database = self.directory/'documents.sqlite3'
        with self.db() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS publication(id TEXT NOT NULL, revision INTEGER NOT NULL, actor TEXT NOT NULL, created TEXT NOT NULL, PRIMARY KEY(id,revision));
            CREATE TABLE IF NOT EXISTS asset_location(id TEXT NOT NULL, revision INTEGER NOT NULL, path TEXT NOT NULL, PRIMARY KEY(id,revision));
            CREATE TABLE IF NOT EXISTS audit(id TEXT NOT NULL, revision INTEGER, actor TEXT NOT NULL, action TEXT NOT NULL, created TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS document(id TEXT PRIMARY KEY, owner TEXT NOT NULL, policy TEXT NOT NULL, origin TEXT NOT NULL, root TEXT NOT NULL, latest INTEGER NOT NULL, lifecycle TEXT NOT NULL DEFAULT 'draft');
            CREATE TABLE IF NOT EXISTS revision(id TEXT NOT NULL, number INTEGER NOT NULL, content BLOB NOT NULL, hash TEXT NOT NULL, path TEXT NOT NULL, actor TEXT NOT NULL, method TEXT NOT NULL, created TEXT NOT NULL, confirmed_by TEXT, PRIMARY KEY(id,number));
            CREATE TABLE IF NOT EXISTS dependency(id TEXT NOT NULL, revision INTEGER NOT NULL, upstream TEXT NOT NULL, upstream_revision INTEGER NOT NULL, upstream_hash TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS candidate(id TEXT PRIMARY KEY, document TEXT NOT NULL, revision INTEGER NOT NULL, target TEXT NOT NULL, status TEXT NOT NULL, actor TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS sync(id TEXT PRIMARY KEY, owner TEXT NOT NULL, document TEXT NOT NULL, revision INTEGER NOT NULL, connector TEXT NOT NULL, remote_id TEXT NOT NULL, expected TEXT, status TEXT NOT NULL, remote_revision TEXT, error TEXT, actor TEXT NOT NULL);
            ''')

    @contextmanager
    def db(self):
        db=sqlite3.connect(self.database, timeout=15);db.row_factory=sqlite3.Row
        try:
            db.execute('BEGIN IMMEDIATE');yield db;db.commit()
        except Exception: db.rollback();raise
        finally: db.close()

    def _document(self, db, owner, identity):
        row=db.execute('SELECT * FROM document WHERE id=? AND owner=?',(identity,owner)).fetchone()
        if row is None: raise ValueError('文档不存在或无权访问')
        return row

    def _revision(self, db, owner, ref):
        self._document(db,owner,ref.id)
        row=db.execute('SELECT * FROM revision WHERE id=? AND number=?',(ref.id,ref.revision)).fetchone()
        if row is None or row['hash']!=ref.sha256:raise ValueError('文档版本引用已失效')
        return row

    def _working_path(self, document, revision):
        path=Path(revision['path'])
        if not path.resolve().is_relative_to(Path(document['root'])):
            raise ValueError('文档文件被移到管理范围之外，请恢复文件或显式迁移')
        return path

    def _append(self, db, row, content, actor, method):
        if not actor.strip():raise ValueError('必须记录实际修改者')
        origin=DocumentOrigin.model_validate_json(row['origin']);policy=OutputPolicy.model_validate_json(row['policy'])
        validate_content(policy.filename, content)
        number=row['latest']+1
        path=Path(row['root'])/segment(origin.task)/segment(origin.run)/segment(origin.step)/row['id']/f'r{number}'/policy.filename
        if policy.asset and policy.scope in ('product', 'project'):
            path = asset_root(row['root'], policy, origin) / 'drafts' / row['id'] / f'r{number}' / policy.filename
        if not path.resolve().is_relative_to(Path(row['root'])):raise ValueError('产物路径超出配置范围')
        path.parent.mkdir(parents=True, exist_ok=True)
        # An interrupted previous write may leave an identical file; never overwrite a different one.
        if path.exists():
            if path.read_bytes()!=content:raise ValueError('产物文件已存在且内容不同，请保留文件并处理冲突')
        else:
            with path.open('xb') as stream:stream.write(content)
        value=digest(content)
        db.execute('INSERT INTO revision VALUES (?,?,?,?,?,?,?,?,NULL)',(row['id'],number,content,value,str(path),actor,method,now()))
        db.execute('UPDATE document SET latest=? WHERE id=?',(number,row['id']))
        db.execute('INSERT INTO audit VALUES (?,?,?,?,?)',(row['id'],number,actor,method,now()))
        return DocumentRef(id=row['id'],revision=number,sha256=value)

    def create(self, owner, policy: OutputPolicy, origin: DocumentOrigin, content: bytes, *, identity=None, inputs=(), task_root=None, workspace_root=None, user_root=None):
        if not owner.strip():raise ValueError('必须指定文档所有者')
        if policy.scope in ('product','project') and not origin.product:raise ValueError('产品资产必须指定产品')
        if policy.scope=='project' and not origin.project:raise ValueError('项目资产必须指定项目')
        validate_content(policy.filename, content)
        root=output_root(self.directory/'deliverables',task=task_root,workspace=workspace_root,user=user_root)
        identity=identity or str(uuid4())
        if any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_' for c in identity) or not identity:raise ValueError('文档标识无效')
        with self.db() as db:
            existing=db.execute('SELECT * FROM document WHERE id=?',(identity,)).fetchone()
            if existing:
                self._document(db,owner,identity)
                old=db.execute('SELECT * FROM revision WHERE id=? AND number=1',(identity,)).fetchone()
                if existing['policy']!=policy.model_dump_json() or existing['origin']!=origin.model_dump_json() or old['content']!=content:
                    raise ValueError('相同产出标识不能绑定不同内容')
                return DocumentRef(id=identity,revision=1,sha256=old['hash'])
            db.execute('INSERT INTO document(id,owner,policy,origin,root,latest) VALUES (?,?,?,?,?,0)',(identity,owner,policy.model_dump_json(),origin.model_dump_json(),str(root)))
            row=self._document(db,owner,identity)
            for ref in inputs:self._revision(db,owner,ref)
            ref=self._append(db,row,content,origin.executor,'generated')
            for upstream in inputs:db.execute('INSERT INTO dependency VALUES (?,?,?,?,?)',(identity,1,upstream.id,upstream.revision,upstream.sha256))
            return ref

    def read(self, owner, ref):
        with self.db() as db:return bytes(self._revision(db,owner,ref)['content'])

    def filename(self, owner, ref):
        with self.db() as db:
            self._revision(db,owner,ref)
            return OutputPolicy.model_validate_json(self._document(db,owner,ref.id)['policy']).filename

    def edit(self, owner, ref, content, *, actor, method='ui'):
        if method not in ('ui','ai','file'):raise ValueError('编辑来源无效')
        with self.db() as db:
            row=self._document(db,owner,ref.id);self._revision(db,owner,ref)
            if row['latest']!=ref.revision:raise ValueError('文档已更新，请对照最新版本后再保存')
            if not OutputPolicy.model_validate_json(row['policy']).editable:raise ValueError('原始证据不可修改，请新增补充记录')
            if row['lifecycle']=='retired':raise ValueError('已废除资产不能修改')
            result=self._append(db,row,content,actor,method)
            db.execute('INSERT INTO dependency SELECT id,?,upstream,upstream_revision,upstream_hash FROM dependency WHERE id=? AND revision=?',(result.revision,ref.id,ref.revision))
            return result

    def confirm(self, owner, ref, actor):
        if not actor.strip():raise ValueError('确认人不能为空')
        with self.db() as db:
            row=self._document(db,owner,ref.id);revision=self._revision(db,owner,ref)
            if row['latest']!=ref.revision:raise ValueError('不能确认过期草稿')
            if row['lifecycle']=='retired':raise ValueError('已废除资产不能确认')
            if digest(self._working_path(row,revision).read_bytes())!=ref.sha256:raise ValueError('文件已有人工修改，请先导入为新版本')
            validate_content(OutputPolicy.model_validate_json(row['policy']).filename, bytes(revision['content']))
            if revision['confirmed_by'] is None:
                db.execute('UPDATE revision SET confirmed_by=? WHERE id=? AND number=?',(actor,ref.id,ref.revision))
                db.execute('INSERT INTO audit VALUES (?,?,?,?,?)',(ref.id,ref.revision,actor,'confirmed',now()))

    def publish_asset(self, owner, ref, actor):
        with self.db() as db:
            row=self._document(db,owner,ref.id);rev=self._revision(db,owner,ref)
            if not OutputPolicy.model_validate_json(row['policy']).asset or not rev['confirmed_by'] or row['latest']!=ref.revision:
                raise ValueError('仅可发布已确认的最新工作资产')
            if not actor.strip():raise ValueError('发布人不能为空')
            if row['lifecycle']=='retired':raise ValueError('已废除资产不能发布')
            if digest(self._working_path(row,rev).read_bytes())!=ref.sha256:raise ValueError('文件已修改，请先导入并确认新版本')
            origin=DocumentOrigin.model_validate_json(row['origin'])
            policy=OutputPolicy.model_validate_json(row['policy'])
            validate_content(policy.filename, bytes(rev['content']))
            root=asset_root(row['root'],policy,origin)
            path=root/ref.id/f'r{ref.revision}'/policy.filename
            if not path.resolve().is_relative_to(Path(row['root'])):raise ValueError('资产路径超出配置范围')
            path.parent.mkdir(parents=True,exist_ok=True)
            if path.exists():
                if path.read_bytes()!=rev['content']:raise ValueError('资产文件已修改，请处理冲突')
            else:
                with path.open('xb') as stream:stream.write(rev['content'])
            db.execute('INSERT OR IGNORE INTO asset_location VALUES (?,?,?)',(ref.id,ref.revision,str(path)))
            db.execute('INSERT OR IGNORE INTO publication VALUES (?,?,?,?)',(ref.id,ref.revision,actor,now()))
            db.execute("UPDATE document SET lifecycle='published' WHERE id=?",(ref.id,))
            return str(path)

    def import_file(self, owner, ref, actor):
        with self.db() as db:
            revision=self._revision(db,owner,ref)
            content=self._working_path(self._document(db,owner,ref.id),revision).read_bytes()
        return self.edit(owner,ref,content,actor=actor,method='file')

    def retire(self, owner, ref, actor):
        if not actor.strip():raise ValueError('必须记录废除人')
        with self.db() as db:
            row=self._document(db,owner,ref.id);self._revision(db,owner,ref)
            if row['latest']!=ref.revision:raise ValueError('资产已更新')
            if not OutputPolicy.model_validate_json(row['policy']).asset:raise ValueError('只有工作资产可以废除')
            db.execute("UPDATE document SET lifecycle='retired' WHERE id=?",(ref.id,))
            db.execute('INSERT INTO audit VALUES (?,?,?,?,?)',(ref.id,ref.revision,actor,'retired',now()))

    def history(self, owner, identity):
        with self.db() as db:
            self._document(db,owner,identity)
            return [dict(row) for row in db.execute('SELECT number,hash,path,actor,method,created,confirmed_by FROM revision WHERE id=? ORDER BY number',(identity,))]

    def list(self, owner, task=None):
        with self.db() as db:
            rows=db.execute('SELECT * FROM document WHERE owner=? ORDER BY rowid',(owner,)).fetchall();items=[]
            for row in rows:
                origin=json.loads(row['origin'])
                if task is not None and origin['task']!=task:continue
                rev=db.execute('SELECT * FROM revision WHERE id=? AND number=?',(row['id'],row['latest'])).fetchone()
                path=self._working_path(row,rev)
                stale=bool(db.execute('SELECT 1 FROM dependency d JOIN document u ON u.id=d.upstream WHERE d.id=? AND d.revision=? AND u.latest<>d.upstream_revision',(row['id'],row['latest'])).fetchone())
                publications=self._publications(db,row)
                published_changed=any(item['status']!='ok' for item in publications)
                working_changed=not path.exists() or digest(path.read_bytes())!=rev['hash']
                items.append({'publications':publications,'published_file_changed':published_changed,'working_file_changed':working_changed,'ref':DocumentRef(id=row['id'],revision=row['latest'],sha256=rev['hash']).model_dump(),
                    'origin':origin,'policy':json.loads(row['policy']),'path':str(path),'confirmed_by':rev['confirmed_by'],
                    'lifecycle': ('published' if db.execute('SELECT 1 FROM publication WHERE id=? AND revision=?',(row['id'],row['latest'])).fetchone() else 'draft') if row['lifecycle']!='retired' else 'retired','upstream_changed':stale,'file_changed':working_changed or published_changed})
            return items

    def _publications(self, db, document):
        rows = db.execute('SELECT a.revision,a.path,r.hash FROM asset_location a JOIN revision r ON r.id=a.id AND r.number=a.revision WHERE a.id=? ORDER BY a.revision', (document['id'],)).fetchall()
        results = []
        for row in rows:
            path = Path(row['path'])
            try:
                if not path.resolve().is_relative_to(Path(document['root'])):
                    status = 'outside'
                elif not path.exists():
                    status = 'missing'
                else:
                    status = 'ok' if digest(path.read_bytes()) == row['hash'] else 'changed'
            except OSError:
                status = 'unavailable'
            results.append({'ref':DocumentRef(id=document['id'],revision=row['revision'],sha256=row['hash']).model_dump(),
                            'path':str(path),'status':status})
        return results

    def restore_publication(self, owner, ref, actor):
        """Explicit recovery; preserve divergent bytes instead of silently destroying them."""
        if not actor.strip():
            raise ValueError('必须记录恢复人')
        import os
        import tempfile
        with self.db() as db:
            document = self._document(db,owner,ref.id)
            revision = self._revision(db,owner,ref)
            published = db.execute('SELECT path FROM asset_location WHERE id=? AND revision=?',(ref.id,ref.revision)).fetchone()
            if published is None:
                raise ValueError('此版本尚未发布')
            path = Path(published['path'])
            if path.is_symlink() or not path.resolve().is_relative_to(Path(document['root'])):
                raise ValueError('发布文件路径异常，请先恢复管理目录')
            validate_content(OutputPolicy.model_validate_json(document['policy']).filename,bytes(revision['content']))
            if path.exists() and digest(path.read_bytes()) == ref.sha256:
                return {'path':str(path),'backup':None}
            path.parent.mkdir(parents=True,exist_ok=True)
            backup = None
            if path.exists():
                backup = path.with_name(path.name+'.conflict-'+uuid4().hex)
                with backup.open('xb') as stream:
                    stream.write(path.read_bytes())
            temporary = None
            try:
                with tempfile.NamedTemporaryFile(dir=path.parent,delete=False) as stream:
                    temporary = Path(stream.name)
                    stream.write(revision['content'])
                os.replace(temporary,path)
            finally:
                if temporary is not None and temporary.exists():temporary.unlink()
            db.execute('INSERT INTO audit VALUES (?,?,?,?,?)',(ref.id,ref.revision,actor,'publication_restored',now()))
            return {'path':str(path),'backup':str(backup) if backup else None}

    def propose_knowledge(self, owner, ref, target: KnowledgeTarget, actor):
        with self.db() as db:
            row=self._document(db,owner,ref.id);self._revision(db,owner,ref)
            if OutputPolicy.model_validate_json(row['policy']).knowledge!='ask':raise ValueError('此产物不参与知识沉淀')
            if row['latest']!=ref.revision or not actor.strip():raise ValueError('需要最新版本及提议人')
            origin=DocumentOrigin.model_validate_json(row['origin'])
            if origin.product and origin.product!=target.product:raise ValueError('知识目标与产物产品不一致')
            if target.scope=='project' and origin.project and origin.project!=target.project:raise ValueError('知识目标与产物项目不一致')
            identity=str(uuid4());db.execute('INSERT INTO candidate VALUES (?,?,?,?,?,?)',(identity,ref.id,ref.revision,target.model_dump_json(),'proposed',actor));return identity

    def close_candidates(self, owner, task):
        return [item for item in self.list(owner,task) if item['policy']['knowledge']=='ask']

    def knowledge_candidates(self, owner):
        with self.db() as db:
            return [dict(row) for row in db.execute('SELECT c.* FROM candidate c JOIN document d ON d.id=c.document WHERE d.owner=?',(owner,))]

    def review_knowledge(self, owner, identity, *, actor, approve):
        if not actor.strip():raise ValueError('必须记录知识确认人')
        with self.db() as db:
            candidate=db.execute('SELECT * FROM candidate WHERE id=?',(identity,)).fetchone()
            if candidate is None:raise ValueError('知识候选不存在')
            row=self._document(db,owner,candidate['document'])
            if candidate['status']!='proposed':raise ValueError('知识候选已处理')
            revision=db.execute('SELECT * FROM revision WHERE id=? AND number=?',(row['id'],candidate['revision'])).fetchone()
            if approve and (row['latest']!=candidate['revision'] or not revision['confirmed_by']):
                raise ValueError('知识审核需要已确认的最新产物')
            status='approved' if approve else 'rejected'
            db.execute('UPDATE candidate SET status=? WHERE id=?',(status,identity))
            db.execute('INSERT INTO audit VALUES (?,?,?,?,?)',(row['id'],candidate['revision'],actor,'knowledge:'+status,now()))
            # Approval is deliberately distinct from publication to a knowledge system.
            return status

    def queue_sync(self, owner, ref, connector, remote_id, expected, *, actor, authorized=False):
        if not authorized or not actor.strip():raise ValueError('外部提交需要针对目标系统的明确授权')
        with self.db() as db:
            rev=self._revision(db,owner,ref)
            if not rev['confirmed_by']:raise ValueError('发布前必须确认此版本')
            previous=db.execute('SELECT id FROM sync WHERE owner=? AND document=? AND revision=? AND connector=? AND remote_id=? AND expected IS ?',(owner,ref.id,ref.revision,connector,remote_id,expected)).fetchone()
            if previous:return previous['id']
            identity=str(uuid4());db.execute('INSERT INTO sync VALUES (?,?,?,?,?,?,?,?,?,?,?)',(identity,owner,ref.id,ref.revision,connector,remote_id,expected,'pending',None,None,actor));return identity

    def sync(self, owner, identity, connectors):
        # Never keep a local write transaction open while calling a remote system.
        with self.db() as db:
            row=db.execute('SELECT * FROM sync WHERE id=? AND owner=?',(identity,owner)).fetchone()
            if row is None:raise ValueError('同步记录不存在')
            if row['status'] in ('synced','conflict'):return dict(row)
            connector=connectors.get(row['connector'])
            if connector is None:raise ValueError('连接器尚未配置')
            if not connector.supports_idempotency:raise ValueError('连接器必须支持幂等提交')
            content=db.execute('SELECT content FROM revision WHERE id=? AND number=?',(row['document'],row['revision'])).fetchone()['content']
        try:
            revision=connector.put(row['remote_id'],bytes(content),expected_revision=row['expected'],idempotency_key=identity)
            if not isinstance(revision,str) or not revision:raise ValueError('连接器未返回远程版本')
            status,error='synced',None
        except Exception as exc:
            from beivymate.documents.connector import VersionConflict
            status='conflict' if isinstance(exc,VersionConflict) else 'failed'
            revision,error=None,type(exc).__name__
        with self.db() as db:
            # A simultaneous retry may already have succeeded with the same key.
            db.execute("UPDATE sync SET status=?,remote_revision=?,error=? WHERE id=? AND status!='synced'",(status,revision,error,identity))
            return dict(db.execute('SELECT * FROM sync WHERE id=?',(identity,)).fetchone())
