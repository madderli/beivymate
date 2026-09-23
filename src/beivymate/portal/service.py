"""Local planning repository. SQLite lifecycle/attachments, editable Markdown drafts."""
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import tempfile
import uuid

from pydantic import ValidationError
from beivymate.configuration.loader import load_workflow_definition
from beivymate.markdown.metadata import parse_markdown
from beivymate.identity.service import IdentityError
from beivymate.portal.models import WorkspaceDraft, TaskDraft


SKILL_NAMES = {
    'requirement_understand': '需求理解', 'test_analysis': '测试分析',
    'test_design': '测试设计', 'test_execution': '测试执行', 'test_report': '测试报告',
}
MAX_FILE = 20 * 1024 * 1024


def sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def encode(draft):
    data = draft.model_dump()
    body = data.pop('description', '')
    lines = ['---']
    # Existing Markdown scalar parser handles quoted strings without YAML execution.
    for key, value in data.items():
        lines.append(f'{key}: "{value}"')
    return ('\n'.join(lines) + '\n---\n\n' + body + '\n').encode('utf-8')


class PortalService:
    def __init__(self, root: Path, workflow_root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.workflow_root = workflow_root.resolve()
        self.configs = self.root / 'configuration'
        self.configs.mkdir(exist_ok=True)
        self.database = self.root / 'portal.sqlite3'
        with self.db() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS pending_file (
                    id TEXT PRIMARY KEY, kind TEXT NOT NULL, expected TEXT, content BLOB NOT NULL
                );
                CREATE TABLE IF NOT EXISTS entity (
                    id TEXT PRIMARY KEY, kind TEXT NOT NULL, owner TEXT NOT NULL,
                    group_id TEXT, main INTEGER NOT NULL DEFAULT 0,
                    workspace TEXT, status TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
                    deleted INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS attachment (
                    id TEXT PRIMARY KEY, group_id TEXT NOT NULL, name TEXT NOT NULL, data BLOB NOT NULL
                );
                CREATE TABLE IF NOT EXISTS sequence (number INTEGER PRIMARY KEY AUTOINCREMENT);
                CREATE TABLE IF NOT EXISTS request (
                    owner TEXT NOT NULL, key TEXT NOT NULL, signature TEXT NOT NULL, result TEXT NOT NULL,
                    PRIMARY KEY(owner, key)
                );
                CREATE TABLE IF NOT EXISTS activity (
                    id TEXT PRIMARY KEY, entity TEXT NOT NULL, actor TEXT NOT NULL,
                    at TEXT NOT NULL, action TEXT NOT NULL
                );
            ''')
        self.database.chmod(0o600)

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.database, timeout=15)
        db.row_factory = sqlite3.Row
        try:
            db.execute('BEGIN IMMEDIATE')
            if db.execute("SELECT 1 FROM sqlite_master WHERE name='pending_file'").fetchone():
                self._flush(db)
            yield db
            db.commit()
            db.execute('BEGIN IMMEDIATE')
            self._flush(db)
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def _path(self, row):
        path = self.configs / row['kind'] / f"{row['id']}.md"
        if path.is_symlink() or not path.resolve().is_relative_to(self.root / "configuration"):
            raise IdentityError('配置路径无效，不能访问工作目录之外的文件。', 409)
        return path

    def _read(self, row):
        path = self._path(row)
        try:
            if path.stat().st_size > 512 * 1024:
                raise ValueError('配置文件过大')
            raw = path.read_bytes()
            metadata, body = parse_markdown(raw.decode('utf-8'), path)
            model = WorkspaceDraft if row['kind'] == 'workspace' else TaskDraft
            if model is TaskDraft:
                metadata['description'] = body
            value = model.model_validate(metadata)
            if value.id != row['id'] or (row['kind'] == 'task' and value.workspace != row['workspace']):
                raise ValueError('标识与归属不可通过文件修改')
            return value, f"{row['version']}:{sha(raw)}"
        except (OSError, UnicodeError, ValueError, ValidationError) as exc:
            raise IdentityError(f"配置 {path.name} 无效或缺失，请检查后重新加载。", 409) from exc

    def _write(self, db, row, value, *, create=False, expected=None):
        path = self._path(row)
        if create and path.exists():
            raise IdentityError('配置文件已经存在，请检查已有文件或使用其他标识。', 409)
        # Journal files with the same transaction as entity/group/attachment records.
        # Pending writes replay on every access after a crash, before exposing data.
        db.execute('INSERT INTO pending_file VALUES (?, ?, ?, ?)',
                   (row['id'], row['kind'], expected, encode(value)))

    def _flush(self, db):
        for change in db.execute('SELECT * FROM pending_file').fetchall():
            path = self._path(change)
            raw = path.read_bytes() if path.exists() else None
            new = bytes(change['content'])
            if raw != new:
                if (sha(raw) if raw is not None else None) != change['expected']:
                    raise IdentityError(f'配置 {path.name} 与待恢复保存发生冲突，已保留手工文件；请备份并核对文件后重试。', 409)
                path.parent.mkdir(parents=True, exist_ok=True)
                fd, name = tempfile.mkstemp(prefix='.draft-', dir=path.parent)
                try:
                    with os.fdopen(fd, 'wb') as f:
                        f.write(new); f.flush(); os.fsync(f.fileno())
                    os.replace(name, path)
                finally:
                    Path(name).unlink(missing_ok=True)
            path.chmod(0o600)
            db.execute('DELETE FROM pending_file WHERE id=?', (change['id'],))

    def _row(self, db, owner, id, kind):
        row = db.execute('SELECT * FROM entity WHERE id=? AND owner=? AND kind=? AND deleted=0', (id, owner, kind)).fetchone()
        if not row:
            raise IdentityError('记录不存在或无权访问。', 404)
        return row

    def _event(self, db, id, owner, message):
        db.execute('INSERT INTO activity VALUES (?, ?, ?, ?, ?)',
                   (str(uuid.uuid4()), id, owner, datetime.now(timezone.utc).isoformat(), message))

    def workflows(self):
        values = []
        seen = set()
        paths = list(self.workflow_root.glob('*.md'))
        custom = getattr(self, 'custom_workflow_root', None)
        if custom is not None:
            paths.extend(custom.glob('*.md'))
        for path in sorted(paths):
            try:
                flow = load_workflow_definition(path)
            except Exception as exc:
                raise IdentityError(f'工作流 {path.name} 配置无效，请修正后重试。', 422) from exc
            if flow.id in seen:
                raise IdentityError('工作流标识重复，请修正配置。', 422)
            seen.add(flow.id)
            values.append({'id': flow.id, 'name': flow.name, 'steps': [
                {'id': s.id, 'name': SKILL_NAMES.get(s.skill, s.skill), 'skill': s.skill, 'review': s.review_mode == 'manual'}
                for s in flow.resolved_steps()]})
        return values

    def _view(self, db, row, flows):
        draft, revision = self._read(row)
        data = draft.model_dump()
        data.update(revision=revision, configPath=str(self._path(row)), owner={'id': row['owner'], 'name': row['owner'], 'kind': 'human'})
        if row['kind'] == 'workspace':
            data.update(paused=row['status'] == 'paused', color='purple')
        else:
            flow = next((f for f in flows if f['id'] == draft.workflow), None)
            data.update(group=row['group_id'], main=bool(row['main']), status=row['status'],
                allowedActions=['resume' if row['status'] == 'paused' else 'pause'],
                steps=[dict(s, status='pending', detail='尚未开始执行') for s in (flow['steps'] if flow else [])],
                attachments=[{'id': a['id'], 'name': a['name'], 'size': a['size']} for a in db.execute(
                    'SELECT id,name,length(data) size FROM attachment WHERE group_id=? ORDER BY id', (row['group_id'],))],
                history=[f"{e['at']} · {e['action']}" for e in db.execute('SELECT * FROM activity WHERE entity=? ORDER BY at', (row['id'],))],
                configurationIssue='' if flow else '所选工作流已不存在，请重新配置。')
        return data

    def board(self, owner):
        flows = self.workflows()
        with self.db() as db:
            rows = db.execute('SELECT * FROM entity WHERE owner=? AND deleted=0 ORDER BY rowid', (owner,)).fetchall()
            return {'workspaces': [self._view(db, r, flows) for r in rows if r['kind'] == 'workspace'],
                    'tasks': [self._view(db, r, flows) for r in rows if r['kind'] == 'task'], 'workflows': flows, 'models': []}

    def workspace(self, owner, body, id=None):
        body = dict(body)
        expected = body.pop('expectedRevision', None)
        paused = body.pop('paused', None)
        with self.db() as db:
            if id:
                row = self._row(db, owner, id, 'workspace')
                old, revision = self._read(row)
                if expected != revision:
                    raise IdentityError('工作区已被修改。请保留当前草稿，重新加载后核对再保存。', 409)
                value = WorkspaceDraft.model_validate({**old.model_dump(), **body})
                if value.id != id:
                    raise IdentityError('工作区标识不能修改。', 422)
                if paused is not None and not isinstance(paused, bool):
                    raise IdentityError('暂停状态无效。', 422)
                self._write(db, row, value, expected=revision.split(":", 1)[1])
                db.execute('UPDATE entity SET status=?, version=version+1 WHERE id=?',
                           ('paused' if paused else 'active' if paused is not None else row['status'], id))
                self._event(db, id, owner, '工作区配置或调度状态已更新')
            else:
                value = WorkspaceDraft.model_validate(body)
                if value.id.upper().startswith('TASK-'):
                    raise IdentityError('TASK- 前缀保留给任务编号，请使用其他工作区标识。', 422)
                if db.execute('SELECT 1 FROM entity WHERE id=?', (value.id,)).fetchone():
                    raise IdentityError('工作区标识已存在。', 409)
                row = {'id': value.id, 'kind': 'workspace'}
                self._write(db, row, value, create=True)
                db.execute("INSERT INTO entity(id,kind,owner,status) VALUES (?, 'workspace', ?, 'active')", (value.id, owner))
                self._event(db, value.id, owner, '创建工作区')
        return {'id': value.id}

    def create_task(self, owner, body, files, key):
        if not key or len(key) > 160:
            raise IdentityError('创建任务需要有效的幂等标识。', 422)
        if len(files) > 5:
            raise IdentityError('最多上传 5 个附件。', 422)
        for name, content in files:
            if not name or len(name) > 240 or '/' in name or '\\' in name or any(ord(c) < 32 for c in name) or not re.search(r'\.(md|txt|pdf|docx|xlsx|png|jpe?g)$', name, re.I) or len(content) > MAX_FILE:
                raise IdentityError('附件名称、类型或大小不符合要求（每个最多 20 MB）。', 422)
        signature = sha(json.dumps([body, [(n, sha(b)) for n, b in files]], sort_keys=True, ensure_ascii=False).encode())
        key = 'create:' + key
        with self.db() as db:
            previous = db.execute('SELECT * FROM request WHERE owner=? AND key=?', (owner, key)).fetchone()
            if previous:
                if previous['signature'] != signature:
                    raise IdentityError('同一提交标识对应的内容已变化，请重新提交。', 409)
                return json.loads(previous['result'])
        related = body.get('relatedWorkspaces', [])
        if not isinstance(related, list) or any(not isinstance(x, str) for x in related):
            raise IdentityError('关联工作区格式不正确。', 422)
        spaces = [body.get('workspace'), *related]
        if len(spaces) != len(set(spaces)) or len(spaces) > 20:
            raise IdentityError('关联工作区重复或超过 20 个。', 422)
        flow_ids = {f['id'] for f in self.workflows()}
        if body.get('workflow') not in flow_ids:
            raise IdentityError('请选择有效工作流。', 422)
        # Reserve a number in a separate transaction; failed creations never reuse IDs.
        with self.db() as db:
            number = db.execute('INSERT INTO sequence DEFAULT VALUES').lastrowid
        group = f'TASK-{datetime.now().year}-{number:05d}'
        try:
            with self.db() as db:
                old = db.execute('SELECT * FROM request WHERE owner=? AND key=?', (owner, key)).fetchone()
                if old:
                    if old['signature'] != signature:
                        raise IdentityError('同一提交标识对应的内容已变化，请重新提交。', 409)
                    return json.loads(old['result'])
                for index, space in enumerate(spaces):
                    ws = self._row(db, owner, space, 'workspace')
                    if ws['status'] == 'paused':
                        raise IdentityError('工作区已暂停，请恢复后创建任务。', 409)
                    self._read(ws)
                    id = group + ('-M' if index == 0 else f'-R{index:02d}')
                    fields = {k: v for k, v in body.items() if k != 'relatedWorkspaces'}
                    value = TaskDraft.model_validate({**fields, 'id': id, 'workspace': space})
                    if not value.description and not files:
                        raise IdentityError('请填写需求与工作目标，或上传需求附件。', 422)
                    row = {'id': id, 'kind': 'task'}
                    self._write(db, row, value, create=True)
                    db.execute("INSERT INTO entity(id,kind,owner,group_id,main,workspace,status) VALUES (?, 'task', ?, ?, ?, ?, 'pending')", (id, owner, group, int(index == 0), space))
                    self._event(db, id, owner, '创建主任务' if index == 0 else '创建关联任务')
                for name, content in files:
                    db.execute('INSERT INTO attachment VALUES (?, ?, ?, ?)', (str(uuid.uuid4()), group, name, content))
                result = {'id': group+'-M', 'group': group}
                db.execute('INSERT INTO request VALUES (?, ?, ?, ?)', (owner, key, signature, json.dumps(result)))
            return result
        except Exception:
            raise

    def update_task(self, owner, id, body):
        fields = dict(body)
        expected = fields.pop('expectedRevision', None)
        flows = {f['id'] for f in self.workflows()}
        with self.db() as db:
            row = self._row(db, owner, id, 'task')
            draft, revision = self._read(row)
            if expected != revision:
                raise IdentityError('任务配置已被修改，请保留草稿并重新加载后核对。', 409)
            if row['status'] not in ('pending', 'paused'):
                raise IdentityError('当前任务状态不允许修改配置。', 409)
            value = TaskDraft.model_validate({**draft.model_dump(), **fields})
            if value.id != id or value.workspace != row['workspace']:
                raise IdentityError('任务标识及所属工作区不能修改。', 422)
            if value.workflow not in flows:
                raise IdentityError('请选择有效工作流。', 422)
            if not value.description and not db.execute('SELECT 1 FROM attachment WHERE group_id=?', (row['group_id'],)).fetchone():
                raise IdentityError('需求正文和附件不能同时为空。', 422)
            self._write(db, row, value, expected=revision.split(":", 1)[1])
            db.execute('UPDATE entity SET version=version+1 WHERE id=?', (id,))
            self._event(db, id, owner, '修改任务配置')
        return {'id': id}

    def action(self, owner, id, body, key):
        if not key or len(key) > 160:
            raise IdentityError('操作缺少有效幂等标识。', 422)
        key = 'action:' + key
        signature = sha(json.dumps([id, body], sort_keys=True).encode())
        with self.db() as db:
            old = db.execute('SELECT * FROM request WHERE owner=? AND key=?', (owner, key)).fetchone()
            if old:
                if old['signature'] != signature:
                    raise IdentityError('操作标识对应的内容不一致。', 409)
                return json.loads(old['result'])
            row = self._row(db, owner, id, 'task')
            _, revision = self._read(row)
            if body.get('expectedRevision') != revision:
                raise IdentityError('任务状态已变化，请刷新后重试。', 409)
            verb = body.get('action')
            if verb not in ('pause', 'resume', 'delete'):
                raise IdentityError('工作流执行将在后续阶段接入，当前仅支持任务管理。', 409)
            if row['status'] not in ('pending', 'paused'):
                raise IdentityError('任务执行中不能进行此操作。', 409)
            if verb == 'delete':
                if row['main'] and db.execute('SELECT 1 FROM entity WHERE group_id=? AND id<>? AND deleted=0', (row['group_id'], id)).fetchone():
                    raise IdentityError('请先处理关联任务，再删除主任务；不会级联删除。', 409)
                db.execute('UPDATE entity SET deleted=1, version=version+1 WHERE id=?', (id,))
            else:
                if verb == 'resume':
                    ws = self._row(db, owner, row['workspace'], 'workspace')
                    if ws['status'] == 'paused':
                        raise IdentityError('请先恢复工作区。', 409)
                if (verb == 'pause' and row['status'] != 'pending') or (verb == 'resume' and row['status'] != 'paused'):
                    raise IdentityError('任务状态不允许此操作。', 409)
                db.execute('UPDATE entity SET status=?, version=version+1 WHERE id=?', ('paused' if verb == 'pause' else 'pending', id))
            self._event(db, id, owner, {'pause':'暂停任务', 'resume':'恢复任务', 'delete':'删除任务（记录归档）'}[verb])
            db.execute('INSERT INTO request VALUES (?, ?, ?, ?)', (owner, key, signature, json.dumps({'accepted': True})))
        return {'accepted': True}

    def attachment(self, owner, task, attachment):
        with self.db() as db:
            row = self._row(db, owner, task, 'task')
            value = db.execute('SELECT name,data FROM attachment WHERE id=? AND group_id=?', (attachment, row['group_id'])).fetchone()
            if not value:
                raise IdentityError('附件不存在或不属于当前任务。', 404)
            return value['name'], bytes(value['data'])
