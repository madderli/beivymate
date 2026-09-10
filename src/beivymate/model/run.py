"""System-owned run snapshot. Execution/checkpoint behavior is added separately."""
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field


class RunRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: Literal["1"] = "1"
    id: str = Field(default_factory=lambda: str(uuid4()), min_length=1)
    task_id: str = Field(min_length=1)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    configuration_snapshot: dict[str, Any]
    status: Literal["created", "running", "waiting", "completed", "failed"] = "created"

    def save_new(self, path: Path) -> None:
        """Exclusive creation prevents overwriting previous run history."""
        with path.open("x", encoding="utf-8") as stream:
            stream.write(self.model_dump_json(indent=2))

    @classmethod
    def load(cls, path: Path) -> "RunRecord":
        return cls.model_validate_json(path.read_text(encoding="utf-8"))
