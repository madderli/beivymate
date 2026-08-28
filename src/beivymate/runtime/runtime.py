from pathlib import Path

from beivymate.configuration.loader import load_workflow_definition
from beivymate.runtime.context import AgentContext
from beivymate.runtime.skill_registry import SkillRegistry
from beivymate.runtime.workflow import Workflow

# Execute the workflow within agent runtime.
class Runtime:

    def __init__(
        self,
        skill_registry: SkillRegistry,
    ) -> None:
        self._skill_registry = skill_registry

    # Load a workflow from user configuration.
    def load_workflow(
        self,
        path: str,
    ) -> Workflow:

        definition = load_workflow_definition(
            Path(path)
        )

        skills = self._skill_registry.resolve(
            definition.steps
        )

        return Workflow(
            definition = definition,
            skills = skills,
        )

    # Execute a workflow.
    def run(
        self,
        workflow: Workflow,
        context: AgentContext | None = None,
    ) -> AgentContext:

        if context is None:
            context = AgentContext()

        workflow.execute(context)

        return context