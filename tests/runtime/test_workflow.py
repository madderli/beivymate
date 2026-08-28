from beivymate.configuration.models import WorkflowDefinition
from beivymate.runtime.context import AgentContext
from beivymate.runtime.skill import Skill
from beivymate.runtime.workflow import Workflow


class RecordingSkill(Skill):

    def __init__(
        self,
        name: str,
        records: list[str],
    ) -> None:

        self._name = name
        self._records = records

    def execute(
        self,
        context: AgentContext,
    ) -> None:

        self._records.append(self._name)


def test_workflow_executes_skills_in_order():

    records: list[str] = []

    definition = WorkflowDefinition(
        id = "test",
        name = "Test Workflow",
        description = "Test",
        steps=[
            "skill_a",
            "skill_b",
        ],
    )

    workflow = Workflow(
        definition=definition,
        skills=[
            RecordingSkill("skill_a", records),
            RecordingSkill("skill_b", records),
        ],
    )

    context = AgentContext()

    workflow.execute(context)

    assert records == [
        "skill_a",
        "skill_b",
    ]