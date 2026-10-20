"""SQLite queue and event log; one local Worker executes one safe unit at a time."""
from contextlib import contextmanager
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import threading
import uuid

from beivymate.identity.service import IdentityError
from beivymate.runtime.checkpoint import Checkpoint, digest
from beivymate.runtime.context import AgentContext
from beivymate.scheduling.locking import exclusive_file

TERMINAL = {'completed', 'failed', 'rejected', 'stopped'}
NOTICE = {'completed', 'failed', 'rejected', 'stopped', 'paused', 'waiting_review',
          'waiting_authorization', 'waiting_input', 'uncertain'}


def now():
    return datetime.now(timezone.utc).isoformat()


class RunService:
    def __init__(self, root, portal, prepare, restore):
        self.root = Path(root); self.portal = portal
        self.prepare = prepare; self.restore = restore
        self.directory = self.root / 'work/runs'
        self.directory.mkdir(parents=True, exist_ok=True)
        self.database = self.directory / 'queue.sqlite3'
        self.stop_event = threading.Event()
        self.thread = None
        with self.db() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS runs(
                  id TEXT PRIMARY KEY, owner TEXT NOT NULL, task TEXT NOT NULL,
                  status TEXT NOT NULL, control TEXT, error TEXT, decision TEXT,
                  created TEXT NOT NULL, updated TEXT NOT NULL);
                CREATE UNIQUE INDEX IF NOT EXISTS one_active_task ON runs(task)
                  WHERE status NOT IN ('completed','failed','rejected','stopped');
                CREATE TABLE IF NOT EXISTS commands(owner TEXT, key TEXT, signature TEXT, result TEXT,
                  PRIMARY KEY(owner,key));
                CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,
                  owner TEXT, run TEXT, task TEXT, status TEXT, message TEXT, at TEXT,
                  unread INTEGER NOT NULL DEFAULT 1, actor TEXT, step TEXT);
            """)
            columns = {row[1] for row in db.execute('PRAGMA table_info(events)')}
            for column in ('actor', 'step'):
                if column not in columns:
                    db.execute(f'ALTER TABLE events ADD COLUMN {column} TEXT')

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.database, timeout=15)
        db.row_factory = sqlite3.Row
        try:
            db.execute('BEGIN IMMEDIATE')
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def path(self, identity):
        # IDs originate in SQLite; never resolve a user supplied path.
        return self.directory / identity / 'checkpoint.json'

    def row(self, db, owner, identity):
        row = db.execute('SELECT * FROM runs WHERE id=? AND owner=?', (identity, owner)).fetchone()
        if row is None:
            raise IdentityError('运行不存在或无权访问', 404)
        return row

    def transition(self, db, row, status, message='', *, actor='system:worker'):
        db.execute('UPDATE runs SET status=?,error=?,updated=? WHERE id=?',
                   (status, message, now(), row['id']))
        if status != row['status']:
            try:
                state = Checkpoint.load(self.path(row['id']))
                steps = state.workflow.resolved_steps()
                step = steps[min(state.index, len(steps)-1)].id
            except (ValueError, OSError):
                step = ''
            db.execute('INSERT INTO events(owner,run,task,status,message,at,unread,actor,step) VALUES(?,?,?,?,?,?,?,?,?)',
                       (row['owner'], row['id'], row['task'], status, message, now(), int(status in NOTICE), actor, step))

    def create(self, owner, task, key, expected_revision):
        if not key or len(key) > 160:
            raise IdentityError('启动需要有效幂等标识', 422)
        signature = digest({'task': task, 'revision': expected_revision})
        with self.db() as db:
            old = db.execute('SELECT * FROM commands WHERE owner=? AND key=?', (owner, key)).fetchone()
            if old:
                if old['signature'] != signature:
                    raise IdentityError('同一请求内容已变化', 409)
                return json.loads(old['result'])
            board = self.portal.board(owner)
            draft = next((t for t in board['tasks'] if t['id'] == task), None)
            if not draft:
                raise IdentityError('任务不存在', 404)
            if draft.get('closedAt'):
                raise IdentityError('任务已关闭，不能启动运行', 409)
            if draft['revision'] != expected_revision:
                raise IdentityError('任务配置已变化，请刷新后重新检查', 409)
            if db.execute("SELECT 1 FROM runs WHERE task=? AND status NOT IN ('completed','failed','rejected','stopped')", (task,)).fetchone():
                raise IdentityError('此任务已有未结束的运行', 409)
            if db.execute("SELECT 1 FROM runs WHERE owner=? AND task=? AND status='completed'", (owner, task)).fetchone():
                raise IdentityError('已完成任务不能重新执行，请复制配置创建新任务。', 409)
            identity = uuid.uuid4().hex
            directory = self.directory / identity
            directory.mkdir(mode=0o700)
            try:
                self.prepare(self.portal, self.root, owner, task, directory, identity)
                prepared = AgentContext.restore(Checkpoint.load(directory / 'checkpoint.json').context)
                if prepared.get('portal_snapshot')['task']['revision'] != expected_revision:
                    raise ValueError('任务配置在准备期间发生变化，请刷新后重试')
            except Exception as exc:
                # Unregistered preparation directories contain no executed work.
                import shutil
                shutil.rmtree(directory)
                raise IdentityError('运行准备失败：' + str(exc), 422) from exc
            stamp = now()
            db.execute('INSERT INTO runs VALUES(?,?,?,?,?,?,?,?,?)',
                       (identity, owner, task, 'prepared', None, '', None, stamp, stamp))
            result = {'id': identity, 'accepted': True}
            db.execute('INSERT INTO commands VALUES(?,?,?,?)', (owner, key, signature, json.dumps(result)))
            return result

    def list(self, owner, task=None):
        with self.db() as db:
            rows = db.execute('SELECT * FROM runs WHERE owner=? ORDER BY created DESC', (owner,)).fetchall()
            return [dict(r) for r in rows if task is None or r['task'] == task]

    def detail(self, owner, identity):
        with self.db() as db:
            row = dict(self.row(db, owner, identity))
        try:
            state = Checkpoint.load(self.path(identity))
            context = AgentContext.restore(state.context)
        except (OSError, ValueError):
            row.pop('decision', None)
            row.update(index=0, steps=[], subjectHash=None, checkpointStatus='uncertain',
                       decisions=[], snapshot=None, outputDirectory='', models={}, artifacts={},
                       events=[], warnings=[], reviewSubject=None,
                       error='运行检查点不可读取，请保留数据并核实；不能自动重放。')
            return row
        row.update(index=state.index, steps=[s.model_dump() for s in state.workflow.resolved_steps()],
                   subjectHash=state.subject_hash, checkpointStatus=state.status,
                   decisions=[d.model_dump(mode='json') for d in state.decisions],
                   snapshot=context.get('portal_snapshot'), outputDirectory=context.get('task_output_directory'),
                   models={key: value.get('resolved_model') for key, value in context.get('skill_packages', {}).items()},
                   artifacts=context.get('document_outputs', {}))
        with self.db() as db:
            row['events'] = [dict(item) for item in db.execute('SELECT * FROM events WHERE owner=? AND run=? ORDER BY id', (owner, identity))]
        row.pop('decision', None)
        row['warnings'] = [f"附件 {item['name']}：{item.get('extraction', '')}" for item in context.get('portal_snapshot', {}).get('attachments', [])]
        if context.get('portal_snapshot', {}).get('workspace', {}).get('knowledge'):
            row['warnings'].append('工作区知识来源当前为配置说明，本次仅使用已冻结的系统知识；客户知识检索由后续阶段接入。')
        row['reviewSubject'] = None
        if state.status == 'waiting_review':
            step = state.workflow.resolved_steps()[state.index]
            package = context.get('skill_packages', {}).get(step.skill, {})
            outputs = package.get('definition', {}).get('outputs', [])
            subject = context.get(f'steps.{step.id}.{outputs[0]}') if outputs else None
            row['reviewSubject'] = subject.model_dump(mode='json') if hasattr(subject, 'model_dump') else subject
        return row

    def command(self, owner, identity, body, key):
        if not key or len(key) > 160:
            raise IdentityError('控制操作需要幂等标识', 422)
        signature = digest({'run': identity, 'body': body})
        with self.db() as db:
            prior = db.execute('SELECT * FROM commands WHERE owner=? AND key=?', (owner, key)).fetchone()
            if prior:
                if prior['signature'] != signature:
                    raise IdentityError('同一请求内容已变化', 409)
                return json.loads(prior['result'])
            row = self.row(db, owner, identity)
            action = body.get('action')
            if row['status'] in TERMINAL:
                raise IdentityError('本次运行已结束，请创建新运行', 409)
            if action == 'start':
                if row['status'] != 'prepared':
                    raise IdentityError('只能启动已准备的运行', 409)
                self.transition(db, row, 'queued', actor=owner)
            elif action in {'pause', 'stop'}:
                if row['status'] == 'running':
                    db.execute('UPDATE runs SET control=? WHERE id=?', (action, identity))
                    db.execute('INSERT INTO events(owner,run,task,status,message,at,unread,actor) VALUES(?,?,?,?,?,?,0,?)',
                               (owner, identity, row['task'], row['status'], '请求' + action, now(), owner))
                else:
                    self.transition(db, row, 'paused' if action == 'pause' else 'stopped', actor=owner)
                    db.execute('UPDATE runs SET control=NULL WHERE id=?', (identity,))
            elif action == 'resume':
                if row['status'] != 'paused':
                    raise IdentityError('仅已暂停的运行可以恢复；待核实结果不能盲目重放', 409)
                self.transition(db, row, 'queued', actor=owner)
            elif action in {'approved', 'rejected'}:
                if row['status'] not in {'waiting_review', 'waiting_authorization'}:
                    raise IdentityError('当前运行没有等待确认', 409)
                state = Checkpoint.load(self.path(identity))
                if not body.get('subjectHash') or body['subjectHash'] != state.subject_hash:
                    raise IdentityError('确认对象已变化，请重新查看', 409)
                decision = {'decision': action, 'actor': owner, 'comment': body.get('comment', ''),
                            'expected_subject_hash': body['subjectHash']}
                db.execute('UPDATE runs SET decision=? WHERE id=?', (json.dumps(decision), identity))
                self.transition(db, row, 'queued', actor=owner)
            elif action == 'supply_execution':
                if row['status'] != 'waiting_input':
                    raise IdentityError('当前步骤没有等待执行结果', 409)
                number = body.get('round')
                if type(number) is not int:
                    raise IdentityError('请填写执行轮次整数', 422)
                from beivymate.execution.service import ExecutionService
                artifact = ExecutionService(self.root / 'work/execution' / row['task'], row['task']).load(number)
                if not artifact.completed or artifact.plan.task_id != row['task']:
                    raise IdentityError('执行轮次尚未完成或任务不匹配', 409)
                state = Checkpoint.load(self.path(identity))
                context = AgentContext.restore(state.context)
                context.set('execution_round_number', number)
                state.context = context.snapshot(); state.write(self.path(identity))
                self.transition(db, row, 'queued', actor=owner)
            else:
                raise IdentityError('不支持的运行操作', 422)
            result = {'accepted': True}
            db.execute('INSERT INTO commands VALUES(?,?,?,?)', (owner, key, signature, json.dumps(result)))
            return result

    def project_board(self, owner, board):
        mapping = {'prepared': 'pending', 'queued': 'queued', 'running': 'running',
                   'waiting_review': 'review', 'waiting_authorization': 'authorization',
                   'waiting_input': 'blocked', 'paused': 'paused', 'completed': 'completed',
                   'failed': 'failed', 'rejected': 'stopped', 'stopped': 'stopped', 'uncertain': 'uncertain'}
        records = self.list(owner)
        for task in board['tasks']:
            history = [r for r in records if r['task'] == task['id']]
            if not history:
                continue
            latest = history[0]
            try:
                state = Checkpoint.load(self.path(latest['id']))
            except (OSError, ValueError):
                task.update(runId=latest['id'], status='uncertain', allowedActions=[],
                            configurationIssue='运行检查点不可读取，请查看运行记录并核实')
                continue
            task['runId'] = latest['id']
            task['runs'] = [{'id': r['id'], 'status': mapping[r['status']], 'startedAt': r['created']} for r in history]
            task['status'] = mapping[latest['status']]
            task['allowedActions'] = []
            task['steps'] = [
                {'id': step.id, 'name': step.skill, 'skill': step.skill,
                 'status': 'completed' if i < state.index else mapping[latest['status']] if i == state.index else 'pending',
                 'detail': latest['error'] if i == state.index else '', 'review': step.review_mode == 'manual'}
                for i, step in enumerate(state.workflow.resolved_steps())]
        return board

    def notifications(self, owner):
        with self.db() as db:
            values = [dict(r) for r in db.execute('SELECT * FROM events WHERE owner=? AND unread=1 ORDER BY id DESC', (owner,))]
        for item in values:
            try:
                context = AgentContext.restore(Checkpoint.load(self.path(item['run'])).context)
                snapshot = context.get('portal_snapshot', {})
            except (OSError, ValueError):
                snapshot = {}
            item['title'] = snapshot.get('task', {}).get('title', item['task'])
            item['workspace'] = snapshot.get('workspace', {}).get('name', '')
        return values

    def acknowledge(self, owner, event):
        with self.db() as db:
            db.execute('UPDATE events SET unread=0 WHERE owner=? AND id=?', (owner, event))

    def recover(self):
        with self.db() as db:
            for row in db.execute("SELECT * FROM runs WHERE status='running'").fetchall():
                try:
                    state = Checkpoint.load(self.path(row['id']))
                    status = 'uncertain' if state.status == 'executing' else ('queued' if state.status == 'ready' else state.status)
                    pending = json.loads(row['decision'] or '{}')
                    if pending and any(d.subject_hash == pending.get('expected_subject_hash')
                                       and d.actor == pending.get('actor')
                                       and d.decision == pending.get('decision') for d in state.decisions):
                        db.execute('UPDATE runs SET decision=NULL WHERE id=?', (row['id'],))
                except (OSError, ValueError):
                    status = 'uncertain'
                if status not in TERMINAL and status != 'uncertain':
                    if row['control'] == 'stop': status = 'stopped'
                    elif row['control'] == 'pause': status = 'paused'
                self.transition(db, row, status, '后台运行曾中断，请核实后继续' if status == 'uncertain' else '')

    def tick(self):
        with self.db() as db:
            row = None
            for candidate in db.execute("SELECT * FROM runs WHERE status='queued' ORDER BY updated").fetchall():
                workspace_status = self.portal.scheduling_state(candidate['owner'], candidate['task'])
                if workspace_status is None:
                    self.transition(db, candidate, 'failed', '所属任务或工作区不可用')
                    continue
                if workspace_status != 'paused':
                    row = dict(candidate)
                    self.transition(db, row, 'running')
                    break
            if row is None:
                return False
        identity = row['id']
        executor_actor = 'system:worker'
        try:
            state = Checkpoint.load(self.path(identity))
            context = AgentContext.restore(state.context)
            executor_actor = 'agent:' + (context.get_role() or 'worker')
            step = state.workflow.resolved_steps()[state.index] if state.index < len(state.workflow.steps) else None
            packages = context.get('skill_packages', {})
            if step and packages.get(step.skill, {}).get('definition', {}).get('executor') == 'test_execution' and not context.get('execution_round_number'):
                status, error = 'waiting_input', '请完成手工／脚本执行轮次，再关联本任务的执行结果'
            else:
                runtime = self.restore(state, self.root, self.path(identity).parent)
                state = runtime.resume(self.path(identity), one_step=True, **json.loads(row['decision'] or '{}'))
                status, error = ('queued' if state.status == 'ready' else state.status), state.error or ''
        except Exception as exc:
            status, error = 'failed', str(exc)
        with self.db() as db:
            current = self.row(db, row['owner'], identity)
            if status not in TERMINAL and status != 'uncertain':
                if current['control'] == 'stop': status = 'stopped'
                elif current['control'] == 'pause': status = 'paused'
            self.transition(db, current, status, error, actor=executor_actor)
            db.execute('UPDATE runs SET control=NULL,decision=NULL WHERE id=?', (identity,))
        return True

    def start(self):
        def loop():
            while not self.stop_event.is_set():
                try:
                    with exclusive_file(self.directory / 'worker.lock'):
                        self.recover()
                        while not self.stop_event.is_set():
                            try:
                                worked = self.tick()
                            except Exception:
                                import logging
                                logging.getLogger(__name__).exception('后台调度异常')
                                worked = False
                            if not worked:
                                self.stop_event.wait(0.5)
                except BlockingIOError:
                    self.stop_event.wait(0.5)
        self.stop_event.clear()
        self.thread = threading.Thread(target=loop, name='beivymate-worker', daemon=True)
        self.thread.start()

    def close(self):
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=2)
