"""Persistent single-user identity. No business workflow state belongs here."""
from contextlib import contextmanager
import hashlib
import hmac
from pathlib import Path
import re
import secrets
import sqlite3
import time
import uuid

from beivymate.identity.access import AccessPolicy

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, InvalidHashError


class IdentityError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


class IdentityService:
    session_seconds = 8 * 60 * 60

    def __init__(self, path: Path, setup_token: str, clock=time.time, access=None):
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.path, self.clock = path, clock
        self.access = access or AccessPolicy()
        self.setup_hash = digest(setup_token)
        self.hasher = PasswordHasher()
        self.dummy_hash = self.hasher.hash(secrets.token_urlsafe(24))
        with self.db() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS account (
                    singleton INTEGER PRIMARY KEY CHECK(singleton=1),
                    id TEXT UNIQUE NOT NULL, username TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL, password TEXT NOT NULL, recovery TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS session (
                    token TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS throttle (
                    bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL, until REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS audit (
                    id TEXT PRIMARY KEY, at REAL NOT NULL, actor TEXT,
                    action TEXT NOT NULL
                );
            """)
        path.chmod(0o600)

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            # Serialize account initialization, recovery and session revocation.
            db.execute("BEGIN IMMEDIATE")
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def initialized(self):
        with self.db() as db:
            return db.execute("SELECT 1 FROM account").fetchone() is not None

    def _verify(self, hashed, value):
        try:
            return self.hasher.verify(hashed, value)
        except (VerificationError, InvalidHashError):
            return False

    def _validate(self, username, password, name=None):
        if not 1 <= len(username) <= 254 or any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in username):
            raise IdentityError("用户名可使用员工邮箱或工号，长度 1～254 个字符，不能包含空白或控制字符。", 422)
        if (not 12 <= len(password) <= 256 or any(c.isspace() for c in password)
                or not all(re.search(pattern, password) for pattern in (r'[A-Z]', r'[a-z]', r'[0-9]', r'[^A-Za-z0-9\s]'))):
            raise IdentityError("密码需为 12～256 个字符，同时包含大写字母、小写字母、数字和符号，不能包含空白字符。", 422)
        if name is not None and not 1 <= len(name.strip()) <= 80:
            raise IdentityError("显示名称需为 1～80 个字符。", 422)

    def _attempt(self, bucket):
        # Committed independently, including unsuccessful authentication attempts.
        with self.db() as db:
            row = db.execute("SELECT * FROM throttle WHERE bucket=?", (bucket,)).fetchone()
            now = self.clock()
            if row and row['until'] > now and row['attempts'] >= 5:
                raise IdentityError("尝试过于频繁，请 5 分钟后重试。", 429)
            count = row['attempts'] + 1 if row and row['until'] > now else 1
            until = row['until'] if row and row['until'] > now else now + 300
            db.execute("INSERT OR REPLACE INTO throttle VALUES (?, ?, ?)", (bucket, count, until))

    def _audit(self, db, action, actor=None):
        db.execute("INSERT INTO audit VALUES (?, ?, ?, ?)",
                   (str(uuid.uuid4()), self.clock(), actor, action))

    def initialize(self, username, password, name, setup_token):
        self._attempt('initialize')
        if not hmac.compare_digest(self.setup_hash, digest(setup_token)):
            raise IdentityError("初始化码不正确，请查看本机服务启动窗口。", 403)
        self._validate(username, password, name)
        recovery = secrets.token_urlsafe(32)
        with self.db() as db:
            if db.execute("SELECT 1 FROM account").fetchone():
                raise IdentityError("本机账户已经初始化，不能重复创建。", 409)
            uid = str(uuid.uuid4())
            db.execute("INSERT INTO account VALUES (1, ?, ?, ?, ?, ?)",
                       (uid, username, name.strip(), self.hasher.hash(password), digest(recovery)))
            self._audit(db, 'account.initialized', uid)
        return recovery

    def login(self, username, password):
        self._attempt('login')
        with self.db() as db:
            account = db.execute("SELECT * FROM account").fetchone()
            valid = self._verify(account['password'] if account else self.dummy_hash, password)
            if not account or not valid or not hmac.compare_digest(account['username'].encode(), username.encode()):
                raise IdentityError("用户名或密码错误。", 401)
            if self.hasher.check_needs_rehash(account['password']):
                db.execute("UPDATE account SET password=?", (self.hasher.hash(password),))
            token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
            db.execute("DELETE FROM session WHERE expires<=?", (self.clock(),))
            db.execute("INSERT INTO session VALUES (?, ?, ?)",
                       (digest(token), csrf, self.clock() + self.session_seconds))
            db.execute("DELETE FROM throttle WHERE bucket='login'")
            self._audit(db, 'session.login', account['id'])
            return token

    def session(self, token):
        with self.db() as db:
            account = db.execute("SELECT * FROM account").fetchone()
            row = db.execute("SELECT * FROM session WHERE token=? AND expires>?",
                             (digest(token or ''), self.clock())).fetchone()
            if not row or not account:
                return {"authenticated": False, "needsInitialization": account is None, "capabilities": []}
            return {"authenticated": True, "needsInitialization": False,
                    "user": {"id": account['id'], "name": account['name'], "username": account['username']},
                    "csrfToken": row['csrf'], "role": "tester",
                    "expiresAt": row['expires'],
                    "entitlement": self.access.describe(),
                    "capabilities": self.access.capabilities(self.clock())}

    def require(self, token, csrf=None, capability=None):
        session = self.session(token)
        if not session['authenticated']:
            raise IdentityError("会话已失效，请重新登录。", 401)
        if csrf is not None and not hmac.compare_digest(session['csrfToken'], csrf):
            raise IdentityError("操作凭证无效，请刷新页面。", 403)
        if capability and capability not in session['capabilities']:
            raise IdentityError("当前功能尚未开放或未获授权。", 403)
        return session

    def logout(self, token):
        with self.db() as db:
            token_hash = digest(token or '')
            # The singleton account owns every local session. Resolve its stable
            # identity before deletion in the same transaction; never trust input.
            actor = db.execute(
                "SELECT account.id FROM account JOIN session ON session.token=?",
                (token_hash,),
            ).fetchone()
            if actor is None:
                return
            db.execute("DELETE FROM session WHERE token=?", (token_hash,))
            self._audit(db, 'session.logout', actor['id'])

    def recover(self, username, recovery, password):
        self._attempt('recovery')
        self._validate(username, password)
        new_code = secrets.token_urlsafe(32)
        with self.db() as db:
            account = db.execute("SELECT * FROM account").fetchone()
            if not account or account['username'] != username or not hmac.compare_digest(account['recovery'], digest(recovery)):
                raise IdentityError("账户或恢复码不正确。", 401)
            db.execute("UPDATE account SET password=?, recovery=?", (self.hasher.hash(password), digest(new_code)))
            db.execute("DELETE FROM session")
            db.execute("DELETE FROM throttle WHERE bucket IN ('login', 'recovery')")
            self._audit(db, 'account.recovered', account['id'])
        return new_code

    def change_password(self, token, current, new):
        self._attempt('password')
        with self.db() as db:
            row = db.execute("SELECT 1 FROM session WHERE token=? AND expires>?", (digest(token), self.clock())).fetchone()
            if not row:
                raise IdentityError("会话已失效，请重新登录。", 401)
            account = db.execute("SELECT * FROM account").fetchone()
            self._validate(account['username'], new)
            if not self._verify(account['password'], current):
                raise IdentityError("当前密码不正确。", 403)
            db.execute("UPDATE account SET password=?", (self.hasher.hash(new),))
            db.execute("DELETE FROM session")
            db.execute("DELETE FROM throttle WHERE bucket='password'")
            self._audit(db, 'account.password_changed', account['id'])

    def rename(self, token, name):
        if not 1 <= len(name.strip()) <= 80:
            raise IdentityError('显示名称需为 1～80 个字符。', 422)
        with self.db() as db:
            if not db.execute('SELECT 1 FROM session WHERE token=? AND expires>?', (digest(token), self.clock())).fetchone():
                raise IdentityError('会话已失效，请重新登录。', 401)
            account = db.execute('SELECT id FROM account').fetchone()
            db.execute('UPDATE account SET name=?', (name.strip(),))
            self._audit(db, 'account.renamed', account['id'])
