from pathlib import Path

import pytest

from beivymate.configuration.loader import load_workflow_definition
from beivymate.configuration.models import WorkflowDefinition
from beivymate.runtime.context import AgentContext
from beivymate.runtime.runtime import Runtime
from beivymate.runtime.skill import Skill
from beivymate.runtime.skill_registry import SkillRegistry


class RecordingSkill(Skill):
    def __init__(self):
        self.records = []

    def can_auto_authorize(self):
        return True

    def can_auto_accept(self, context):
        return True

    def review_subject(self, context):
        return context.get("result")

    def execute(self, context):
        self.records.append((context.get("step_id"), context.get("step_inputs"),
                             context.get("analysis_strategy"), context.get("review_mode")))
        context.set("result", "first result")


def files(tmp_path):
    workflow = tmp_path / "workflow.md"
    workflow.write_text("---\nid: flow\nname: Flow\nsteps:\n  - first.md\n  - second.md\n---\n")
    (tmp_path / "first.md").write_text(
        "---\nid: first\nskill: recording\ninputs:\n  - requirement\nanalysis_strategy: simple\nreview_mode: auto\nauthorization_mode: auto\n---\n")
    (tmp_path / "second.md").write_text(
        "---\nid: second\nskill: recording\ninputs:\n  - result\nanalysis_strategy: deep\nreview_mode: manual\nauthorization_mode: auto\n---\n")
    return workflow


def test_step_references_repeat_skill_and_resolve_inputs(tmp_path, monkeypatch):
    workflow = files(tmp_path)
    monkeypatch.chdir(tmp_path.parent)
    registry = SkillRegistry()
    skill = RecordingSkill()
    registry.register("recording", skill)
    runtime = Runtime(registry)
    loaded = runtime.load_workflow(str(workflow))
    snapshot = WorkflowDefinition.model_validate(loaded.definition.model_dump())
    assert snapshot.resolved_steps()[1].id == "second"
    context = AgentContext()
    context.set("requirement", "source")
    state = runtime.start(loaded, context, tmp_path / "run.json")
    assert state.status == "waiting_review"
    assert skill.records == [
        ("first", {"requirement": "source"}, "simple", "auto"),
        ("second", {"result": "first result"}, "deep", "manual"),
    ]


def test_missing_inputs_fail_before_skill(tmp_path):
    registry = SkillRegistry()
    skill = RecordingSkill()
    registry.register("recording", skill)
    runtime = Runtime(registry)
    with pytest.raises(ValueError, match="first.*requirement"):
        runtime.start(runtime.load_workflow(str(files(tmp_path))), AgentContext(), tmp_path / "run.json")
    assert skill.records == []


@pytest.mark.parametrize("old,new", [("id: second", "id: first"),
                                      ("review_mode: manual", "review_mode: invalid"),
                                      ("analysis_strategy: deep", "analysis_strategy: typo")])
def test_invalid_step_configuration(tmp_path, old, new):
    workflow = files(tmp_path)
    step = tmp_path / "second.md"
    step.write_text(step.read_text().replace(old, new))
    with pytest.raises(ValueError):
        load_workflow_definition(workflow)


def test_legacy_repeated_skills_get_unique_step_ids(tmp_path):
    workflow = tmp_path / "flow.md"
    workflow.write_text("---\nid: f\nname: F\nsteps:\n  - same\n  - same\n---\n")
    definition = load_workflow_definition(workflow)
    assert definition.steps == ["same", "same"]
    assert [step.id for step in definition.resolved_steps()] == ["step_1", "step_2"]
