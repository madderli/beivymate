from pathlib import Path

import pytest

from beivymate.configuration.models import WorkflowDefinition, WorkflowStepDefinition
from beivymate.runtime.context import AgentContext
from beivymate.runtime.memory import (ContextItem, ContextBudget, BudgetExceeded, select_context,
                                      EvidenceReference, ExecutionMemory, ExecutionSegment)
from beivymate.runtime.runtime import Runtime
from beivymate.runtime.skill import Skill
from beivymate.runtime.skill_registry import SkillRegistry
from beivymate.runtime.workflow import Workflow


def test_scope_version_and_deferred_accounting():
    items = [ContextItem(id="product", layer="workspace", workspace_id="w", product_id="p",
                         versions=["2"], content="rule", source_ref="r", required=True),
             ContextItem(id="other", layer="workspace", workspace_id="w", project_id="other",
                         content="secret", source_ref="r"),
             ContextItem(id="large", layer="task", task_id="t", content="x" * 100, source_ref="r")]
    result = select_context(items, 10, workspace_ids=["w"], targets={"p": "2"},
                            project_id="current", task_id="t", run_id="run")
    assert [item.id for item in result.selected] == ["product"]
    assert result.excluded == ["other"] and result.deferred == ["large"]
    with pytest.raises(BudgetExceeded):
        select_context(items, 1, workspace_ids=["w"], targets={"p": "2"},
                       project_id="current", task_id="t", run_id="run")
    with pytest.raises(ValueError, match="outside"):
        select_context(items, 100, workspace_ids=["w"], targets={"p": "1"},
                       project_id="current", task_id="t", run_id="run")


def test_final_request_budget_includes_output_and_framing():
    budget = ContextBudget(input_limit=20, output_reserve=5, framing_reserve=2)
    assert budget.check_request("abc") == 5
    with pytest.raises(BudgetExceeded):
        budget.check_request("中" * 5)


def test_evidence_tamper_and_uncertain_segment_block(tmp_path):
    path = tmp_path / "evidence.txt"
    path.write_text("paid")
    ref = EvidenceReference.capture(path)
    memory = ExecutionMemory(case_id="case", segments=[ExecutionSegment(id="pay")])
    memory.complete_segment("pay", [ref])
    assert not memory.ready_for_report()  # No assertions were recorded.
    with pytest.raises(ValueError):
        memory.complete_segment("pay", [ref])
    path.write_text("changed")
    with pytest.raises(ValueError, match="changed"):
        ref.read()
    memory.segments[0].status = "uncertain"
    with pytest.raises(ValueError, match="Reconcile"):
        memory.next_segment()


def test_long_e2e_survives_repeated_process_state_restore(tmp_path):
    calls = []
    names = [f"segment-{i}" for i in range(25)]

    class SegmentSkill(Skill):
        def can_auto_authorize(self):
            return True

        def execute(self, context):
            memory = context.get("execution_memory")
            name = memory.next_segment()
            assert name == context.get("step_id")
            assert memory.business_objects["order_id"] == "ORDER-001"
            evidence = tmp_path / f"{name}.txt"
            evidence.write_text(f"{name}: observed ORDER-001")
            memory.complete_segment(name, [EvidenceReference.capture(evidence)])
            memory.assertions[name] = "passed"
            calls.append(name)

        def review_subject(self, context):
            return context.get("execution_memory")

    def runtime():
        registry = SkillRegistry()
        registry.register("segment", SegmentSkill())
        return Runtime(registry)

    steps = [WorkflowStepDefinition(id=name, skill="segment", authorization_mode="auto") for name in names]
    workflow = Workflow(WorkflowDefinition(id="e2e", name="E2E", steps=["segment"] * len(names),
                                          step_definitions=steps), [SegmentSkill() for _ in names])
    context = AgentContext()
    context.set("execution_memory", ExecutionMemory(case_id="E2E-1",
                segments=[ExecutionSegment(id=name) for name in names],
                business_objects={"order_id": "ORDER-001"}, assertions={name: "pending" for name in names}))
    path = tmp_path / "checkpoint.json"
    state = runtime().start(workflow, context, path)
    for _ in names:
        assert state.status == "waiting_review"
        state = runtime().resume(path, decision="approved", actor="tester", expected_subject_hash=state.subject_hash)
    assert state.status == "completed" and calls == names
    memory = AgentContext.restore(state.context).get("execution_memory")
    assert memory.ready_for_report() and memory.next_segment() is None
    assert memory.business_objects == {"order_id": "ORDER-001"}
    assert all(segment.evidence[0].read() for segment in memory.segments)
