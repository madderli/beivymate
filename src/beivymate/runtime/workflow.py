from pydantic import BaseModel, Field
from beivymate.runtime.context import AgentContext
from beivymate.runtime.skill import Skill

# Configuration model for a workflow.
class WorkflowDefinition(BaseModel):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    description: str = ""
    skill_ids: list[str] = Field(min_length=1)

# Executable workflow that consists of a sequence of skills.
class Workflow:
    def __init__(
        self,
        definition: WorkflowDefinition,
        skills: list[Skill],
    ) -> None:
        if len(definition.skill_ids) != len(skills):
            raise ValueError(
                "The number of skills must match the number of skill IDs."
            )

        self._definition = definition
        self._skills = skills

    @property
    def definition(self) -> WorkflowDefinition:
        return self._definition

    @property
    def skills(self) -> list[Skill]:
        return self._skills

    # Execute skills in workfow order using the provided AgentContext. Each skill's execute method is called in sequence.
    def execute(self, context: AgentContext) -> None:
        """Execute skills in workflow order."""
        for skill in self._skills:
            skill.execute(context)