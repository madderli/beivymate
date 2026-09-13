"""Frozen execution scope and durable attempts. Publication is not execution approval."""
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4
from pydantic import Field
from beivymate.model.artifact.requirement_understanding import Contract, Text
from beivymate.model.artifact.test_design import CaseRevision


def now():
    return datetime.now(timezone.utc).isoformat()


class ExecutionItem(Contract):
    id: Text = Field(default_factory=lambda: str(uuid4()))
    case: CaseRevision
    environment: Text
    product_version: Text
    mode: Literal['manual','automated']
    executor: Text
    runner_id: Text | None = None


class ExecutionPlan(Contract):
    id: Text = Field(default_factory=lambda: str(uuid4()))
    task_id: Text
    name: Text
    source: Text
    items: list[ExecutionItem] = Field(min_length=1)
    defect_mode: Literal['manual','auto'] = 'manual'


class StepObservation(Contract):
    step: int = Field(ge=1)
    actual: Text
    result: Literal['pass','failed','blocked']
    evidence: list[str] = Field(default_factory=list)


class ExecutionAttempt(Contract):
    id: Text = Field(default_factory=lambda: str(uuid4()))
    item_id: Text
    executor: Text
    mode: Literal['manual','automated']
    started_at: Text = Field(default_factory=now)
    ended_at: str | None = None
    status: Literal['running','paused','pass','failed','blocked','error','uncertain'] = 'running'
    observations: list[StepObservation] = Field(default_factory=list)
    reason: str = ''
    evidence: list[str] = Field(default_factory=list)


class DefectVerification(Contract):
    round_number: int = Field(ge=1)
    attempt_id: Text
    result: Literal['pass','failed','blocked','error']
    actor: Text
    recorded_at: Text = Field(default_factory=now)


class Defect(Contract):
    verifications: list[DefectVerification] = Field(default_factory=list)
    number: Text
    title: Text
    description: Text
    steps: list[dict]
    actual_result: str = ''
    severity: Text = '一般'
    priority: Text = 'P2'
    evidence: list[str] = Field(default_factory=list)
    submitter: Text
    submitted_at: str | None = None
    case_id: Text
    case_revision: int
    requirement_refs: list[dict]
    rounds: list[int]
    attempt_ids: list[str]
    status: Literal['draft','registered'] = 'draft'


class ExecutionArtifact(Contract):
    id: Text = Field(default_factory=lambda: str(uuid4()))
    plan: ExecutionPlan
    round_number: int = Field(ge=1)
    attempts: list[ExecutionAttempt] = Field(default_factory=list)
    completed: bool = False
    defects: list[Defect] = Field(default_factory=list)
    deliverables: dict[str, str] = Field(default_factory=dict)


