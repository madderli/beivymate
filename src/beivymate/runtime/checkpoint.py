"""Local single-writer checkpoints; no dynamic imports or pickle during restore."""
import hashlib
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator
from beivymate.model.artifact.test_report import ReportArtifact
from beivymate.model.artifact.test_execution import ExecutionArtifact, ExecutionPlan

from beivymate.configuration.models import WorkflowDefinition
from beivymate.knowledge.models import KnowledgeDocument, KnowledgeRequirement
from beivymate.model.artifact.requirement_understanding import UnderstandingArtifact
from beivymate.model.artifact.test_analysis import AnalysisArtifact
from beivymate.model.artifact.test_design import DesignArtifact, CaseRevision, ProductCatalog
from beivymate.model.entity.requirement import Requirement
from beivymate.runtime.memory import ContextItem, ContextSelection, ContextBudget, ExecutionMemory
from beivymate.integration.contracts import AssetReference, TestCaseAsset, ExecutionRequest, ExecutionResult

TYPES = {cls.__name__: cls for cls in (
    ReportArtifact, ExecutionArtifact, ExecutionPlan,
    Requirement, UnderstandingArtifact, AnalysisArtifact, KnowledgeDocument, KnowledgeRequirement,
    DesignArtifact, CaseRevision, ProductCatalog,
    ContextItem, ContextSelection, ContextBudget, ExecutionMemory,
    AssetReference, TestCaseAsset, ExecutionRequest, ExecutionResult,
)}


def encode(value):
    if isinstance(value, BaseModel):
        name = type(value).__name__
        if name not in TYPES or TYPES[name] is not type(value):
            raise TypeError(f"Unsupported checkpoint model: {name}")
        return {"kind": "model", "type": name, "value": value.model_dump(mode="json")}
    if isinstance(value, dict):
        if any(not isinstance(key, str) for key in value):
            raise TypeError("Checkpoint dictionary keys must be strings")
        return {"kind": "dict", "value": {key: encode(item) for key, item in value.items()}}
    if isinstance(value, list):
        return {"kind": "list", "value": [encode(item) for item in value]}
    if value is None or type(value) in (str, int, float, bool):
        return {"kind": "scalar", "value": value}
    raise TypeError(f"Unsupported checkpoint value: {type(value).__name__}")


def decode(value):
    kind = value["kind"]
    if kind == "model":
        return TYPES[value["type"]].model_validate(value["value"])
    if kind == "dict":
        return {key: decode(item) for key, item in value["value"].items()}
    if kind == "list":
        return [decode(item) for item in value["value"]]
    if kind == "scalar":
        return value["value"]
    raise ValueError(f"Unknown checkpoint encoding: {kind}")


def digest(value) -> str:
    return hashlib.sha256(json.dumps(encode(value), sort_keys=True, ensure_ascii=False,
                                     allow_nan=False).encode()).hexdigest()


class Decision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    step_id: str
    phase: Literal["authorization", "review"]
    decision: Literal["approved", "rejected"]
    mode: Literal["manual", "auto"]
    actor: str = Field(min_length=1)
    comment: str = ""
    subject_hash: str
    artifact_id: str | None = None
    artifact_revision: int | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Checkpoint(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: Literal["1"] = "1"
    run_id: str = Field(default_factory=lambda: str(uuid4()))
    workflow: WorkflowDefinition
    context: dict[str, Any]
    index: int = Field(default=0, ge=0)
    status: Literal["ready", "waiting_authorization", "executing", "waiting_review",
                    "completed", "rejected", "failed", "uncertain"] = "ready"
    subject_hash: str | None = None
    decisions: list[Decision] = Field(default_factory=list)
    error: str | None = None

    @model_validator(mode="after")
    def validate_position(self):
        count = len(self.workflow.steps)
        if self.index > count or (self.status == "completed" and self.index != count):
            raise ValueError("Invalid checkpoint position")
        if self.status in {"waiting_review", "waiting_authorization", "executing"} and self.index >= count:
            raise ValueError("Checkpoint has no current step")
        return self

    def accepted_artifact(self, step_id: str, kind: str = "requirement_understanding"):
        from beivymate.runtime.context import AgentContext
        artifact = AgentContext.restore(self.context).get(f"steps.{step_id}.{kind}")
        if artifact is None:
            raise ValueError("Artifact not found")
        if not any(d.step_id == step_id and d.phase == "review" and d.decision == "approved"
                   and d.subject_hash == digest(artifact) for d in self.decisions):
            raise ValueError("Artifact is not accepted or has changed")
        artifact.require_data()
        return artifact

    def write(self, path: Path, *, new=False):
        content = self.model_dump_json(indent=2)
        if new:
            with path.open("x", encoding="utf-8") as stream:
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
            return
        fd, temporary = tempfile.mkstemp(dir=path.parent, prefix=".checkpoint-")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    @classmethod
    def load(cls, path: Path):
        return cls.model_validate_json(path.read_text(encoding="utf-8"))


def exclusive_resume(method):
    """Reject concurrent local resumes; OS releases the lock after process exit."""
    from functools import wraps
    import fcntl

    @wraps(method)
    def wrapped(self, checkpoint_path, *args, **kwargs):
        path = Path(checkpoint_path)
        with path.with_suffix(path.suffix + ".lock").open("a") as lock:
            try:
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as exc:
                raise ValueError("Run is already being resumed") from exc
            try:
                return method(self, path, *args, **kwargs)
            finally:
                fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
    return wrapped
