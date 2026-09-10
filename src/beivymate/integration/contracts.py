from datetime import datetime
from typing import Annotated, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from beivymate.model.entity.test_case import TestCase
from beivymate.runtime.memory import EvidenceReference

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AssetReference(Contract):
    system: Text  # native, or an adapter-owned system ID
    kind: Literal["requirement", "test_case", "script", "defect", "execution"]
    external_id: Text
    version: Text
    locator: Text  # Opaque to Runtime, never interpreted as a shell command.


class TestCaseAsset(Contract):
    reference: AssetReference
    case: TestCase
    product_ids: list[Text] = Field(min_length=1)
    project_id: Text | None = None
    requirement_refs: list[AssetReference] = Field(default_factory=list)
    script_refs: list[AssetReference] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_kinds(self):
        if self.reference.kind != "test_case":
            raise ValueError("Case asset requires a test_case reference")
        if any(ref.kind != "script" for ref in self.script_refs):
            raise ValueError("script_refs must reference scripts")
        if any(ref.kind != "requirement" for ref in self.requirement_refs):
            raise ValueError("requirement_refs must reference requirements")
        return self


class ExecutionTarget(Contract):
    product_id: Text
    project_id: Text | None = None
    environment_id: Text
    planned_version: Text


class ExecutionRequest(Contract):
    id: Text
    task_id: Text
    run_id: Text
    step_id: Text
    case: AssetReference
    targets: list[ExecutionTarget] = Field(min_length=1)
    runner_id: Text
    script: AssetReference | None = None
    idempotency_key: Text
    authorization_ref: Text  # Resolved by the trusted caller, not a self-issued grant.

    @model_validator(mode="after")
    def validate_kinds(self):
        if self.case.kind != "test_case" or (self.script and self.script.kind != "script"):
            raise ValueError("Invalid execution asset kind")
        if len({target.product_id for target in self.targets}) != len(self.targets):
            raise ValueError("One environment per product per request; create separate requests for multiple environments")
        return self


class ExecutionResult(Contract):
    request_id: Text
    attempt: int = Field(ge=1)
    status: Literal["passed", "failed", "blocked", "not_run", "error", "uncertain"]
    actual_result: Text
    evidence: list[EvidenceReference] = Field(default_factory=list)
    observed_versions: dict[str, Text] = Field(default_factory=dict)
    external_execution: AssetReference | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None

    @model_validator(mode="after")
    def validate_observation(self):
        if self.status in {"passed", "failed"} and (not self.evidence or not self.observed_versions):
            raise ValueError("Test verdict requires evidence and observed product versions")
        if self.external_execution and self.external_execution.kind != "execution":
            raise ValueError("Expected an execution reference")
        if self.started_at and self.finished_at and self.finished_at < self.started_at:
            raise ValueError("Execution finish precedes start")
        return self


class RetryPolicy(Contract):
    max_attempts: int = Field(default=1, ge=1)

    def allows_retry(self, result: ExecutionResult, *, idempotent: bool,
                     reconciled_no_effect: bool) -> bool:
        # Failed assertions are not infrastructure failures. Unknown effects need reconciliation.
        return (result.status == "error" and result.attempt < self.max_attempts
                and idempotent and reconciled_no_effect)


class AssetReader(Protocol):
    def read_case(self, reference: AssetReference) -> TestCaseAsset: ...


class AssetWriter(Protocol):
    def save_case(self, asset: TestCaseAsset, *, expected_version: str | None) -> AssetReference: ...


class ExecutionAdapter(Protocol):
    def execute(self, request: ExecutionRequest) -> ExecutionResult: ...
    def reconcile(self, request: ExecutionRequest) -> ExecutionResult: ...


class ResultImporter(Protocol):
    def import_result(self, reference: AssetReference, request: ExecutionRequest) -> ExecutionResult: ...


def validate_execution_result(request: ExecutionRequest, result: ExecutionResult) -> None:
    if result.request_id != request.id:
        raise ValueError("Execution result belongs to another request")
    if result.status in {"passed", "failed"}:
        expected = {target.product_id: target.planned_version for target in request.targets}
        if result.observed_versions != expected:
            raise ValueError("Observed versions do not match the requested test scope")
        for ref in result.evidence:
            ref.read()
