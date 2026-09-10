"""Bounded working context and durable execution facts, independent of chat history."""
import hashlib
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class MemoryModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ContextItem(MemoryModel):
    id: str = Field(min_length=1)
    layer: Literal["professional", "workspace", "task", "run"]
    content: str
    workspace_id: str | None = None
    project_id: str | None = None
    task_id: str | None = None
    run_id: str | None = None
    product_id: str | None = None
    versions: list[str] = Field(default_factory=list)
    source_ref: str = Field(min_length=1)
    priority: int = 0
    required: bool = False

    @model_validator(mode="after")
    def validate_owner(self):
        owner = {"workspace": self.workspace_id, "task": self.task_id, "run": self.run_id}
        if self.layer in owner and not owner[self.layer]:
            raise ValueError(f"{self.layer} context requires an owner ID")
        if self.versions and not self.product_id:
            raise ValueError("Version-scoped context requires a product ID")
        return self


class ContextSelection(MemoryModel):
    selected: list[ContextItem] = Field(default_factory=list)
    deferred: list[str] = Field(default_factory=list)
    excluded: list[str] = Field(default_factory=list)
    estimated_tokens: int = 0


def estimate_tokens(text: str) -> int:
    # Conservative UTF-8 byte proxy, not a provider tokenizer or a universal bound.
    return len(text.encode("utf-8"))


class BudgetExceeded(ValueError):
    pass


class ContextBudget(MemoryModel):
    input_limit: int = Field(default=64000, gt=0)
    output_reserve: int = Field(default=4000, ge=0)
    framing_reserve: int = Field(default=512, ge=0)

    def check_request(self, text: str) -> int:
        estimated = estimate_tokens(text) + self.framing_reserve
        if estimated + self.output_reserve > self.input_limit:
            raise BudgetExceeded("Context budget exceeded: split the work or explicitly increase the budget; no input was truncated")
        return estimated


def select_context(items: list[ContextItem], budget: int, *, workspace_ids: list[str],
                   targets: dict[str, str], project_id: str | None,
                   task_id: str | None, run_id: str | None) -> ContextSelection:
    if budget < 0:
        raise BudgetExceeded("No working-context budget remains")
    result = ContextSelection()
    if len({item.id for item in items}) != len(items):
        raise ValueError("Context item IDs must be unique")
    for item in sorted(items, key=lambda item: (not item.required, -item.priority, item.id)):
        eligible = (
            (item.layer != "workspace" or item.workspace_id in workspace_ids)
            and (item.layer != "task" or (item.task_id is not None and item.task_id == task_id))
            and (item.layer != "run" or (item.run_id is not None and item.run_id == run_id))
            and (item.project_id is None or item.project_id == project_id)
            and (item.product_id is None or item.product_id in targets)
            and (not item.versions or (item.product_id is not None and targets.get(item.product_id) in item.versions))
        )
        if not eligible:
            if item.required:
                raise ValueError(f"Required context {item.id} is outside the active scope")
            result.excluded.append(item.id)
            continue
        cost = estimate_tokens(item.content) + estimate_tokens(item.source_ref)
        if result.estimated_tokens + cost > budget:
            if item.required:
                raise BudgetExceeded(f"Required context does not fit: {item.id}")
            result.deferred.append(item.id)
            continue
        result.selected.append(item)
        result.estimated_tokens += cost
    return result


class EvidenceReference(MemoryModel):
    path: str
    sha256: str

    @classmethod
    def capture(cls, path: Path):
        return cls(path=str(path.resolve()), sha256=hashlib.sha256(path.read_bytes()).hexdigest())

    def read(self) -> bytes:
        content = Path(self.path).read_bytes()
        if hashlib.sha256(content).hexdigest() != self.sha256:
            raise ValueError("Evidence content changed")
        return content


class ExecutionSegment(MemoryModel):
    id: str = Field(min_length=1)
    status: Literal["pending", "completed", "blocked", "uncertain"] = "pending"
    evidence: list[EvidenceReference] = Field(default_factory=list)


class ExecutionMemory(MemoryModel):
    case_id: str = Field(min_length=1)
    segments: list[ExecutionSegment]
    business_objects: dict[str, str] = Field(default_factory=dict)
    assertions: dict[str, Literal["pending", "passed", "failed", "blocked"]] = Field(default_factory=dict)

    @model_validator(mode="after")
    def unique_segments(self):
        if len({item.id for item in self.segments}) != len(self.segments):
            raise ValueError("Execution segment IDs must be unique")
        return self

    def complete_segment(self, segment_id: str, evidence: list[EvidenceReference]) -> None:
        matches = [segment for segment in self.segments if segment.id == segment_id]
        if len(matches) != 1:
            raise ValueError("Segment must exist exactly once")
        segment = matches[0]
        if segment.status != "pending":
            raise ValueError("Completed or uncertain segments cannot be blindly replayed")
        if not evidence:
            raise ValueError("Completion requires evidence")
        for ref in evidence:
            ref.read()
        segment.evidence = evidence
        segment.status = "completed"

    def next_segment(self) -> str | None:
        for segment in self.segments:
            if segment.status in {"uncertain", "blocked"}:
                raise ValueError("Reconcile blocked or uncertain execution before continuing")
            if segment.status == "pending":
                return segment.id
        return None

    def ready_for_report(self) -> bool:
        return (bool(self.segments) and all(item.status == "completed" for item in self.segments)
                and bool(self.assertions) and all(value in {"passed", "failed"} for value in self.assertions.values()))
