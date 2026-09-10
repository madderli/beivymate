import pytest
from beivymate.integration.contracts import (AssetReference, ExecutionRequest, ExecutionTarget,
    ExecutionResult, RetryPolicy, TestCaseAsset as CaseAsset, validate_execution_result)
from beivymate.model.entity.test_case import TestCase as Case
from beivymate.runtime.memory import EvidenceReference


def reference(kind="test_case"):
    return AssetReference(system="existing-system", kind=kind, external_id="42", version="7", locator="opaque:42")


def request():
    return ExecutionRequest(id="request", task_id="task", run_id="run", step_id="step", case=reference(),
        runner_id="existing-ci", idempotency_key="run-step-attempt", authorization_ref="decision:1",
        targets=[ExecutionTarget(product_id="p", environment_id="uat", planned_version="2")])


def test_existing_case_and_script_identity_roundtrip():
    asset = CaseAsset(reference=reference(), case=Case(id="local-1", title="Payment", description="Existing case",
        preconditions="Order exists", steps=["Pay"], expected_results=["Paid"]),
        product_ids=["p"], script_refs=[reference("script")])
    restored = CaseAsset.model_validate_json(asset.model_dump_json())
    assert restored.reference.external_id == "42" and restored.case.id == "local-1"
    assert restored.script_refs[0].version == "7"


def test_fake_existing_runner_and_evidence_validation(tmp_path):
    path = tmp_path / "result.txt"
    path.write_text("Order paid")
    class FakeAdapter:
        def execute(self, req):
            return ExecutionResult(request_id=req.id, attempt=1, status="passed", actual_result="Paid",
                                   evidence=[EvidenceReference.capture(path)], observed_versions={"p":"2"})
    req = request()
    result = FakeAdapter().execute(req)
    validate_execution_result(req, result)
    path.write_text("changed")
    with pytest.raises(ValueError, match="changed"):
        validate_execution_result(req, result)


@pytest.mark.parametrize("status", ["passed", "failed"])
def test_no_verdict_without_evidence(status):
    with pytest.raises(ValueError):
        ExecutionResult(request_id="r", attempt=1, status=status, actual_result="LLM says passed")


def test_retry_never_replays_unknown_or_assertion_failure():
    policy = RetryPolicy(max_attempts=3)
    result = ExecutionResult(request_id="r", attempt=1, status="uncertain", actual_result="Timeout after submit")
    assert not policy.allows_retry(result, idempotent=True, reconciled_no_effect=True)
    result.status = "error"
    assert not policy.allows_retry(result, idempotent=True, reconciled_no_effect=False)
    assert policy.allows_retry(result, idempotent=True, reconciled_no_effect=True)
    result.attempt = 3
    assert not policy.allows_retry(result, idempotent=True, reconciled_no_effect=True)
