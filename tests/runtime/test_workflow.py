from beivymate.runtime.context import AgentContext
from beivymate.runtime.skill import Skill
from beivymate.runtime.skill_registry import SkillRegistry
from beivymate.runtime.workflow import Workflow, WorkflowDefinition

# Test double used to verify workflow execution.
class TestRecordSkill(Skill):

    def __init__(self, name: str) -> None:
        self.name = name

    def execute(self, context: AgentContext) -> None:
        execution_order = context.get("execution_order", [])
        execution_order.append(self.name)
        context.set("execution_order", execution_order)


def test_workflow_executes_skills_in_order() -> None:
    definition = WorkflowDefinition(
        id = "test_workflow",
        name = "Test Workflow",
        description = "Test workflow",
        skill_ids = [
            "first",
            "second",
        ],
    )

    first_skill = TestRecordSkill("first")
    second_skill = TestRecordSkill("second")

    workflow = Workflow(
        definition = definition,
        skills = [
            first_skill,
            second_skill,
        ],
    )

    context = AgentContext()

    workflow.execute(context)

    assert context.get("execution_order") == [
        "first",
        "second",
    ]


def test_workflow_rejects_mismatched_skill_count() -> None:
    definition = WorkflowDefinition(
        id = "test_workflow",
        name = "Test Workflow",
        skill_ids = [
            "first",
            "second",
        ],
    )

    first_skill = TestRecordSkill("first")

    try:
        Workflow(
            definition = definition,
            skills = [first_skill],
        )
        assert False
    except ValueError as exc:
        assert (
            str(exc)
            == "The number of skills must match the number of skill IDs."
        )


def test_workflow_definition_resolves_skills_from_registry() -> None:
    registry = SkillRegistry()

    first_skill = TestRecordSkill("first")
    second_skill = TestRecordSkill("second")

    registry.register("first", first_skill)
    registry.register("second", second_skill)

    definition = WorkflowDefinition(
        id = "test_workflow",
        name = "Test Workflow",
        description = "Test workflow",
        skill_ids = [
            "first",
            "second",
        ],
    )

    skills = registry.resolve(definition.skill_ids)

    workflow = Workflow(
        definition = definition,
        skills = skills,
    )

    context = AgentContext()

    workflow.execute(context)

    assert context.get("execution_order") == [
        "first",
        "second",
    ]