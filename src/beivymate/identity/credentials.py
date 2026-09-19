"""Secrets belong in the OS credential vault, never Markdown or SQLite."""
import keyring
from beivymate.identity.service import IdentityError


class CredentialVault:
    def _backend(self):
        backend = keyring.get_keyring()
        # Fail closed: do not permit plaintext or third-party fallback backends.
        if not type(backend).__module__.startswith((
            'keyring.backends.macOS', 'keyring.backends.Windows', 'keyring.backends.SecretService'
        )):
            raise IdentityError('系统安全凭据库不可用；不会改用明文保存。', 503)
        return backend

    def save(self, user_id: str, connection: str, secret: str):
        try:
            self._backend().set_password('BeIvyMate', f'{user_id}:{connection}', secret)
        except IdentityError:
            raise
        except Exception:
            raise IdentityError('无法写入系统凭据库，请检查系统授权。', 503) from None

    def delete(self, user_id: str, connection: str):
        try:
            backend = self._backend()
            account = f'{user_id}:{connection}'
            # Only an explicit absent result is an idempotent success. Read
            # errors and delete failures must remain visible to the caller.
            if backend.get_password('BeIvyMate', account) is None:
                return
            backend.delete_password('BeIvyMate', account)
        except keyring.errors.PasswordDeleteError:
            raise IdentityError('凭据删除失败，请检查系统授权后重试。', 503) from None
        except IdentityError:
            raise
        except Exception:
            raise IdentityError('无法访问系统凭据库。', 503) from None
