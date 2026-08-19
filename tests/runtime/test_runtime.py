from pathlib import Path

from beivymate.runtime.context import AgentContext
from beivymate.runtime.runtime import Runtime
from beivymate.runtime.skill import Skill
from beivymate.runtime.skill_registry import SkillRegistry

WORKFLOW_PATH = Path("tests/fixtures/workflow.md")

# Test double used to verify runtime execution.
class TestRecordSkill(Skill):

    def __init__(self, name: str) -> None:
        self.name = name

    def execute(self, context: AgentContext) -> None:
        execution_order = context.get("execution_order", [])
        execution_order.append(self.name)
        context.set("execution_order", execution_order)


def test_runtime_loads_workflow_from_markdown() -> None:
    registry = SkillRegistry()

    registry.register(
        "tester_requirement_understanding",
        TestRecordSkill("tester_requirement_understanding"),
    )

    registry.register(
        "test_analysis",
        TestRecordSkill("test_analysis"),
    )

    registry.register(
        "test_design",
        TestRecordSkill("test_design"),
    )

    registry.register(
        "test_execution",
        TestRecordSkill("test_execution"),
    )

    registry.register(
        "test_report",
        TestRecordSkill("test_report"),
    )

    runtime = Runtime(registry)

    workflow = runtime.load_workflow(
        str(WORKFLOW_PATH)
    )

    assert workflow.definition.name == "Standard Testing Flow"

    assert len(workflow.skills) == 5


def test_runtime_runs_workflow() -> None:
    registry = SkillRegistry()

    skill_ids = [
        "tester_requirement_understanding",
        "test_analysis",
        "test_design",
        "test_execution",
        "test_report",
    ]

    for skill_id in skill_ids:
        registry.register(
            skill_id,
            TestRecordSkill(skill_id),
        )

    runtime = Runtime(registry)

    workflow = runtime.load_workflow(
        str(WORKFLOW_PATH)
    )

    context = runtime.run(workflow)

    assert context.get("execution_order") == skill_ids

def test_runtime_uses_existing_context() -> None:
    registry = SkillRegistry()

    registry.register(
        "tester_requirement_understanding",
        TestRecordSkill("tester_requirement_understanding"),
    )

    registry.register(
        "test_analysis",
        TestRecordSkill("test_analysis"),
    )

    registry.register(
        "test_design",
        TestRecordSkill("test_design"),
    )

    registry.register(
        "test_execution",
        TestRecordSkill("test_execution"),
    )

    registry.register(
        "test_report",
        TestRecordSkill("test_report"),
    )

    runtime = Runtime(registry)

    workflow = runtime.load_workflow(
        str(WORKFLOW_PATH)
    )

    context = AgentContext()

    context.set("requirement", "test requirement")

    result = runtime.run(
        workflow,
        context,
    )

    assert result is context

    assert result.get("requirement") == "test requirement"

    assert result.get("execution_order") == [
        "tester_requirement_understanding",
        "test_analysis",
        "test_design",
        "test_execution",
        "test_report",
    ]