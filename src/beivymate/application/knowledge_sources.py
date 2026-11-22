"""Local knowledge source registry. Access checks inspect paths without reading contents."""
from contextlib import closing, contextmanager
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sqlite3
import stat
import subprocess
import sys
from threading import Lock
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator
from beivymate.identity.service import IdentityError


class SourcePath(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    kind: Literal['file', 'directory']
    storage: Literal['local', 'shared']
    path: str = Field(min_length=1, max_length=2000)

    @field_validator('path')
    @classmethod
    def validate_path(cls, value):
        path = Path(value)
        if '\x00' in value or not path.is_absolute():
            raise ValueError('请填写本机可访问的绝对路径')
        return os.path.normpath(value)


class SourceDraft(SourcePath):
    name: str = Field(min_length=1, max_length=80)
    revision: int | None = None
    additional: list[SourcePath] = Field(default_factory=list, max_length=99)


class PathSelection(BaseModel):
    kind: Literal['file', 'directory']


def select_path(kind):
    if sys.platform == 'darwin':
        choice = 'choose folder' if kind == 'directory' else 'choose file'
        script = f"""try
    set selectedPath to {choice}
    return POSIX path of selectedPath
on error number -128
    return ""
end try"""
        command = ['/usr/bin/osascript', '-e', script]
    elif sys.platform == 'win32':
        dialog = 'FolderBrowserDialog' if kind == 'directory' else 'OpenFileDialog'
        property_name = 'SelectedPath' if kind == 'directory' else 'FileName'
        script = (
            '[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); '
            'Add-Type -AssemblyName System.Windows.Forms; '
            f'$dialog = New-Object System.Windows.Forms.{dialog}; '
            f'if ($dialog.ShowDialog() -eq "OK") {{ [Console]::WriteLine($dialog.{property_name}) }}; '
            '$dialog.Dispose()'
        )
        command = ['powershell.exe', '-NoProfile', '-NonInteractive', '-STA', '-Command', script]
    else:
        command = ['zenity', '--file-selection']
        if kind == 'directory':
            command.append('--directory')
    try:
        result = subprocess.run(command, capture_output=True, encoding='utf-8', timeout=300)
    except subprocess.TimeoutExpired as exc:
        raise IdentityError('选择文件超时，请重新打开浏览窗口', 408) from exc
    except OSError as exc:
        raise IdentityError('无法打开系统选择窗口，请手动填写路径', 503) from exc
    if result.returncode == 1 and command[0] == 'zenity' and not result.stderr:
        return None
    if result.returncode != 0:
        raise IdentityError('无法打开系统选择窗口，请手动填写路径', 503)
    path = result.stdout.removesuffix('\n')
    if not path:
        return None
    if not Path(path).is_absolute():
        raise IdentityError('系统未返回可用的文件路径，请手动填写路径', 503)
    return os.path.normpath(path)


def knowledge_source_router(root, portal, require):
    router = APIRouter(prefix='/api/v1/knowledge-sources')
    database = root / 'knowledge-sources.sqlite3'

    @contextmanager
    def db():
        with closing(sqlite3.connect(database)) as connection, connection:
            connection.row_factory = sqlite3.Row
            yield connection

    with db() as connection:
        connection.execute("""CREATE TABLE IF NOT EXISTS source (
            id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL,
            kind TEXT NOT NULL, storage TEXT NOT NULL, path TEXT NOT NULL,
            updated TEXT NOT NULL, revision INTEGER NOT NULL,
            UNIQUE(owner, path)
        )""")

        if not any(column['name'] == 'additional' for column in connection.execute('PRAGMA table_info(source)')):
            connection.execute("ALTER TABLE source ADD COLUMN additional TEXT NOT NULL DEFAULT '[]'")

    def owner(request):
        return require(request, 'configuration.manage')['user']['id']

    def find(connection, actor, identity):
        row = connection.execute(
            'SELECT * FROM source WHERE owner=? AND id=?', (actor, identity)
        ).fetchone()
        if row is None:
            raise IdentityError('知识来源不存在', 404)
        return row

    def public(row):
        return {**{key: row[key] for key in row.keys() if key != 'owner'},
                'additional': json.loads(row['additional'])}

    @router.get('')
    def listing(request: Request):
        actor = owner(request)
        with db() as connection:
            return {'items': [public(row) for row in connection.execute(
                'SELECT * FROM source WHERE owner=? ORDER BY updated DESC, id', (actor,)
            )]}

    picker_lock = Lock()

    @router.post('/pick-path')
    def pick_path(request: Request, draft: PathSelection):
        owner(request)
        if not picker_lock.acquire(blocking=False):
            raise IdentityError('已有文件选择窗口打开', 409)
        try:
            return {'path': select_path(draft.kind)}
        finally:
            picker_lock.release()

    def save(actor, draft, identity=None):
        now = datetime.now(timezone.utc).isoformat()
        paths = [os.path.normcase(entry.path) for entry in [draft, *draft.additional]]
        if len(set(paths)) != len(paths):
            raise IdentityError('同一知识中不能重复添加路径', 409)
        values = (draft.name, draft.kind, draft.storage, draft.path, now,
                  json.dumps([entry.model_dump() for entry in draft.additional], ensure_ascii=False))
        try:
            with db() as connection:
                connection.execute('BEGIN IMMEDIATE')
                for row in connection.execute('SELECT * FROM source WHERE owner=?', (actor,)):
                    if row['id'] != identity and any(
                        os.path.normcase(entry) in paths for entry in source_paths(row)
                    ):
                        raise IdentityError('该路径已登记，请编辑已有知识来源', 409)
                if identity is None:
                    identity = uuid4().hex
                    connection.execute(
                        'INSERT INTO source (id,owner,name,kind,storage,path,updated,additional,revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)',
                        (identity, actor, *values),
                    )
                else:
                    find(connection, actor, identity)
                    result = connection.execute(
                        """UPDATE source SET name=?,kind=?,storage=?,path=?,updated=?,additional=?,
                        revision=revision+1 WHERE owner=? AND id=? AND revision=?""",
                        (*values, actor, identity, draft.revision),
                    )
                    if not result.rowcount:
                        raise IdentityError('来源已修改，请刷新后重试', 409)
                return public(find(connection, actor, identity))
        except sqlite3.IntegrityError as exc:
            raise IdentityError('该路径已登记，请编辑已有知识来源', 409) from exc

    @router.post('', status_code=201)
    def create(request: Request, draft: SourceDraft):
        return save(owner(request), draft)

    @router.put('/{identity}')
    def update(identity: str, request: Request, draft: SourceDraft):
        return save(owner(request), draft, identity)

    @router.post('/{identity}/access')
    def check(identity: str, request: Request):
        actor = owner(request)
        with db() as connection:
            row = find(connection, actor, identity)
        entries = [row, *json.loads(row['additional'])]
        failures = [
            {'path': entry['path'], 'message': message}
            for entry in entries
            if (message := probe(entry))
        ]
        return {'revision': row['revision'], 'accessible': not failures,
                'message': f'{len(failures)} 条路径不可访问' if failures else '全部路径可读取',
                'failures': failures}

    def source_paths(row):
        return {row['path'], *(entry['path'] for entry in json.loads(row['additional']))}

    def probe(row):
        path = Path(row['path'])
        try:
            mode = path.stat().st_mode
            if row['kind'] == 'directory' and stat.S_ISDIR(mode):
                with os.scandir(path) as entries:
                    next(entries, None)
            elif row['kind'] == 'file' and stat.S_ISREG(mode):
                # O_NONBLOCK also prevents hanging if a file is replaced by a pipe.
                descriptor = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
                try:
                    if not stat.S_ISREG(os.fstat(descriptor).st_mode):
                        return '路径不是普通文件'
                finally:
                    os.close(descriptor)
            else:
                return '实际路径类型与资料类型不一致'
            return None
        except FileNotFoundError:
            message = '找不到该路径，请确认文件存在或共享存储已挂载'
        except PermissionError:
            message = '没有读取权限，请检查本机账户的访问权限'
        except OSError:
            message = '无法访问该路径，请检查存储连接'
        return message

    @router.get('/{identity}/references')
    def references(identity: str, request: Request):
        actor = owner(request)
        with db() as connection:
            source = find(connection, actor, identity)
        paths = source_paths(source)
        items = []
        with portal.db() as connection:
            rows = connection.execute(
                "SELECT * FROM entity WHERE owner=? AND kind='workspace' AND deleted=0", (actor,)
            ).fetchall()
            for row in rows:
                workspace, _ = portal._read(row)
                for value in workspace.knowledgeDirectories or [workspace.knowledge]:
                    if value and os.path.normpath(value) in paths:
                        items.append({'id': workspace.id, 'name': workspace.name, 'path': value})
                        break
        return {'items': items}

    return router
