"""Company connectors implement CAS plus idempotency; local services own no credentials."""
from typing import Protocol


class VersionConflict(Exception): pass


class DocumentConnector(Protocol):
    supports_idempotency: bool
    def put(self, remote_id: str, content: bytes, *, expected_revision: str | None, idempotency_key: str) -> str: ...
    def get(self, remote_id: str, revision: str) -> bytes: ...
