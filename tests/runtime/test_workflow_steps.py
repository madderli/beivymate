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
    workflow.write_text("---\nid: flow\nname: Flow\n---\n\n## 步骤：first\n- 技能：recording\n- 输入：requirement\n- 分析策略：simple\n- 结果确认：auto\n- 执行授权：auto\n\n## 步骤：second\n- 技能：recording\n- 输入：result\n- 分析策略：deep\n- 结果确认：manual\n- 执行授权：auto\n")
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


@pytest.mark.parametrize("old,new", [("步骤：second", "步骤：first"),
                                      ("结果确认：manual", "结果确认：invalid"),
                                      ("分析策略：deep", "分析策略：typo")])
def test_invalid_step_configuration(tmp_path, old, new):
    workflow = files(tmp_path)
    step = workflow
    step.write_text(step.read_text().replace(old, new))
    with pytest.raises(ValueError):
        load_workflow_definition(workflow)


def test_legacy_repeated_skills_get_unique_step_ids(tmp_path):
    workflow = tmp_path / "flow.md"
    workflow.write_text("---\nid: f\nname: F\nsteps:\n  - same\n  - same\n---\n")
    with pytest.raises(ValueError, match="单文件步骤"):
        load_workflow_definition(workflow)
