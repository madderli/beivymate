from pathlib import Path

import pytest

from beivymate.configuration.models import WorkflowDefinition, WorkflowStepDefinition
from beivymate.runtime.checkpoint import Checkpoint
from beivymate.runtime.context import AgentContext
from beivymate.runtime.runtime import Runtime
from beivymate.runtime.skill import Skill
from beivymate.runtime.skill_registry import SkillRegistry
from beivymate.runtime.workflow import Workflow


class ProducingSkill(Skill):
    def __init__(self, calls, acceptable=True):
        self.calls = calls
        self.acceptable = acceptable

    def can_auto_authorize(self):
        return True

    def execute(self, context):
        step = context.get("step_id")
        self.calls.append(step)
        context.set(step, {"revision": 1, "content": "result"})

    def review_subject(self, context):
        return context.get(context.get("step_id"))

    def can_auto_accept(self, context):
        return self.acceptable


def setup(calls, review="manual", authorization="auto", acceptable=True):
    skill = ProducingSkill(calls, acceptable)
    registry = SkillRegistry()
    registry.register("produce", skill)
    steps = [WorkflowStepDefinition(id=name, skill="produce", review_mode=review,
                                    authorization_mode=authorization) for name in ("first", "second")]
    workflow = Workflow(WorkflowDefinition(id="flow", name="Flow", steps=["produce"] * 2,
                                          step_definitions=steps), [skill, skill])
    return Runtime(registry), workflow


def test_manual_restart_preserves_prior_work_and_binds_decision(tmp_path):
    calls = []
    runtime, workflow = setup(calls)
    path = tmp_path / "run.json"
    state = runtime.start(workflow, AgentContext(), path)
    assert state.status == "waiting_review" and calls == ["first"]
    runtime, _ = setup(calls)
    assert runtime.resume(path).status == "waiting_review"
    with pytest.raises(ValueError, match="stale"):
        runtime.resume(path, decision="approved", actor="reviewer", expected_subject_hash="old")
    state = runtime.resume(path, decision="approved", actor="reviewer", expected_subject_hash=state.subject_hash)
    assert state.status == "waiting_review" and calls == ["first", "second"]
    state = runtime.resume(path, decision="approved", actor="reviewer", expected_subject_hash=state.subject_hash)
    assert state.status == "completed"
    runtime.resume(path)
    assert calls == ["first", "second"]
    assert len([d for d in state.decisions if d.phase == "review"]) == 2


def test_auto_accept_and_fallback_to_human(tmp_path):
    runtime, workflow = setup([], review="auto")
    assert runtime.start(workflow, AgentContext(), tmp_path / "auto.json").status == "completed"
    runtime, workflow = setup([], review="auto", acceptable=False)
    assert runtime.start(workflow, AgentContext(), tmp_path / "fallback.json").status == "waiting_review"


def test_authorization_precedes_execution_and_rejection_stops(tmp_path):
    calls = []
    runtime, workflow = setup(calls, authorization="manual")
    path = tmp_path / "run.json"
    state = runtime.start(workflow, AgentContext(), path)
    assert state.status == "waiting_authorization" and calls == []
    state = runtime.resume(path, decision="rejected", actor="reviewer", expected_subject_hash=state.subject_hash)
    assert state.status == "rejected" and calls == []


def test_manual_authorization_then_auto_review(tmp_path):
    calls = []
    runtime, workflow = setup(calls, review="auto", authorization="manual")
    path = tmp_path / "run.json"
    state = runtime.start(workflow, AgentContext(), path)
    state = runtime.resume(path, decision="approved", actor="reviewer", expected_subject_hash=state.subject_hash)
    assert calls == ["first"] and state.status == "waiting_authorization"


def test_interrupted_execution_never_replayed(tmp_path):
    calls = []
    runtime, workflow = setup(calls)
    path = tmp_path / "run.json"
    state = runtime.start(workflow, AgentContext(), path)
    state.status = "executing"
    state.write(path)
    assert runtime.resume(path).status == "uncertain"
    assert calls == ["first"]


def test_modified_artifact_invalidates_confirmation(tmp_path):
    runtime, workflow = setup([])
    path = tmp_path / "run.json"
    state = runtime.start(workflow, AgentContext(), path)
    context = AgentContext.restore(state.context)
    context.set("first", {"revision": 2, "content": "changed"})
    state.context = context.snapshot()
    state.write(path)
    with pytest.raises(ValueError, match="stale"):
        runtime.resume(path, decision="approved", actor="reviewer", expected_subject_hash=state.subject_hash)


def test_unknown_checkpoint_type_fails_before_execution(tmp_path):
    calls = []
    runtime, workflow = setup(calls)
    context = AgentContext()
    context.set("unsupported", object())
    with pytest.raises(TypeError):
        runtime.start(workflow, context, tmp_path / "run.json")
    assert calls == []


def test_organization_manual_policy_overrides_task_auto(tmp_path):
    calls = []
    runtime, workflow = setup(calls, review="auto")
    state = runtime.start(workflow, AgentContext(), tmp_path / "run.json",
                          review_mode="auto", force_manual=True)
    assert state.status == "waiting_authorization" and calls == []
    assert state.workflow.resolved_steps()[0].review_mode == "manual"


def test_explicit_workflow_cannot_bypass_confirmation():
    runtime, workflow = setup([])
    with pytest.raises(ValueError, match="requires start"):
        runtime.run(workflow)


def test_real_artifact_restores_types_and_records_version(tmp_path):
    import json
    from beivymate.agent.tester.skills.tester_requirement_understanding import TesterRequirementUnderstandingSkill
    from beivymate.configuration.models import TemplateDefinition
    from beivymate.model.artifact.requirement_understanding import UnderstandingArtifact, UnderstandingData
    from beivymate.model.entity.requirement import Requirement
    from beivymate.runtime.llm.models import LLMResponse

    class Gateway:
        calls = 0

        def chat(self, request):
            self.calls += 1
            data = {name: {"status": "not_provided", "reason": "未提供"}
                    for name in UnderstandingData.model_fields if name != "unknowns"}
            data["unknowns"] = []
            return LLMResponse(model="fake", content=json.dumps(data))

    gateway = Gateway()
    skill = TesterRequirementUnderstandingSkill(gateway, "fake", TemplateDefinition(
        id="t", name="T", role="tester", version="1", content="分析需求"))
    registry = SkillRegistry()
    registry.register("understand", skill)
    step = WorkflowStepDefinition(id="understand", skill="understand", authorization_mode="auto")
    workflow = Workflow(WorkflowDefinition(id="f", name="F", steps=["understand"],
                                          step_definitions=[step]), [skill])
    context = AgentContext()
    context.set("requirement", Requirement(id="REQ", title="支付", content="支持支付"))
    path = tmp_path / "run.json"
    state = Runtime(registry).start(workflow, context, path)
    restored = AgentContext.restore(state.context)
    artifact = restored.get("steps.understand.requirement_understanding")
    assert isinstance(artifact, UnderstandingArtifact)
    assert isinstance(restored.get("requirement"), Requirement)
    state = Runtime(registry).resume(path, decision="approved", actor="human",
                                     expected_subject_hash=state.subject_hash)
    assert state.status == "completed" and gateway.calls == 1
    assert state.decisions[-1].artifact_id == artifact.id
    assert state.decisions[-1].artifact_revision == artifact.revision


def test_failure_is_saved_and_not_retried(tmp_path):
    calls = []
    runtime, workflow = setup(calls)

    def fail(context):
        calls.append("attempt")
        raise RuntimeError("tool failed")

    workflow.skills[0].execute = fail
    path = tmp_path / "run.json"
    with pytest.raises(RuntimeError, match="tool failed"):
        runtime.start(workflow, AgentContext(), path)
    assert runtime.resume(path).status == "failed"
    assert calls == ["attempt"]
