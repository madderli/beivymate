from beivymate.configuration.models import WorkflowDefinition
from beivymate.runtime.context import AgentContext
from beivymate.runtime.skill import Skill

# Executable workflow
class Workflow:

    def __init__(
        self,
        definition: WorkflowDefinition,
        skills: list[Skill],
    ) -> None:

        if len(definition.steps) != len(skills):
            raise ValueError(
                "The number of workflow steps must match "
                "the number of skills."
            )

        self._definition = definition
        self._skills = skills

    @property
    def definition(self) -> WorkflowDefinition:
        return self._definition

    @property
    def skills(self) -> list[Skill]:
        return self._skills

    def execute(
        self,
        context: AgentContext,
    ) -> None:

        for skill in self._skills:
            skill.execute(context)