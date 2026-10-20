"""Installation-local validation/publication records, never part of shared packages."""
from contextlib import contextmanager
import json
from pathlib import Path
import sqlite3


class ResourceRegistry:
    def __init__(self, database: Path):
        self.database = database
        database.parent.mkdir(parents=True, exist_ok=True)
        with self.db() as db:
            db.execute('''CREATE TABLE IF NOT EXISTS resource (
                kind TEXT NOT NULL, id TEXT NOT NULL, revision TEXT NOT NULL,
                state TEXT NOT NULL, validated TEXT, errors TEXT NOT NULL DEFAULT '[]',
                PRIMARY KEY(kind,id))''')
        database.chmod(0o600)

    @contextmanager
    def db(self):
        with sqlite3.connect(self.database, timeout=15) as db:
            db.row_factory = sqlite3.Row
            db.execute('BEGIN IMMEDIATE')
            yield db

    def observe(self, kind, identity, revision):
        with self.db() as db:
            row = db.execute('SELECT * FROM resource WHERE kind=? AND id=?', (kind,identity)).fetchone()
            if row is None or row['revision'] != revision:
                db.execute('INSERT OR REPLACE INTO resource VALUES (?,?,?,?,?,?)',
                           (kind,identity,revision,'discovered',None,'[]'))
                return {'state':'discovered','errors':[]}
            return {'state':row['state'],'errors':json.loads(row['errors'])}

    def draft(self, kind, identity, revision):
        with self.db() as db:
            db.execute('INSERT OR REPLACE INTO resource VALUES (?,?,?,?,?,?)',
                       (kind,identity,revision,'draft',None,'[]'))

    def validate(self, kind, identity, revision, errors):
        self.observe(kind, identity, revision)
        with self.db() as db:
            db.execute('UPDATE resource SET state=?,validated=?,errors=? WHERE kind=? AND id=? AND revision=?',
                       ('invalid' if errors else 'validated', None if errors else revision,
                        json.dumps(errors,ensure_ascii=False),kind,identity,revision))
        return {'state':'invalid' if errors else 'validated','errors':errors}

    def publish(self, kind, identity, revision):
        with self.db() as db:
            row = db.execute('SELECT * FROM resource WHERE kind=? AND id=?', (kind,identity)).fetchone()
            if row is None or row['revision'] != revision or row['validated'] != revision or row['state'] not in ('validated','published'):
                raise ValueError('必须先验证当前内容，再确认发布')
            db.execute("UPDATE resource SET state='published' WHERE kind=? AND id=?", (kind,identity))

    def pause(self, kind, identity, revision):
        with self.db() as db:
            row = db.execute('SELECT * FROM resource WHERE kind=? AND id=?', (kind,identity)).fetchone()
            if row is None or row['revision'] != revision:
                raise FileExistsError('资源已变化，请重新加载')
            db.execute("UPDATE resource SET state='paused',validated=NULL WHERE kind=? AND id=?", (kind,identity))

    def require_published(self, kind, identity, revision):
        if self.observe(kind,identity,revision)['state'] != 'published':
            raise ValueError('资源尚未在本机验证并发布，或内容已变化：' + identity)
