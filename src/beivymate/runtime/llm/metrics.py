"""Per-call observations; counts supplied by the provider are never estimated."""
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field


class CallMetric(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    model: str
    status: Literal["success", "failed"]
    duration_seconds: float = Field(ge=0)
    input_tokens: int | None = Field(default=None, ge=0)
    output_tokens: int | None = Field(default=None, ge=0)
    estimated_input_units: int = Field(ge=0)
    estimate_method: str = "utf8_bytes_excluding_message_framing"
    error_type: str | None = None


class JsonlMetricsSink:
    """Local single-writer log; deliberately excludes prompts and error bodies."""
    def __init__(self, path: Path):
        self.path = path

    def __call__(self, metric: CallMetric):
        with self.path.open("a", encoding="utf-8") as stream:
            stream.write(metric.model_dump_json() + "\n")
