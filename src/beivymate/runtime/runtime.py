from beivymate.runtime.context import AgentContext
from beivymate.runtime.skill_registry import SkillRegistry
from beivymate.runtime.workflow import Workflow
from beivymate.runtime.workflow_parser import WorkflowParser

# Execute workflows within an agent runtime.
class Runtime:

    def __init__(self, skill_registry: SkillRegistry) -> None:
        self._skill_registry = skill_registry

    # Load a workflow from a Markdown file and return a Workflow object.
    def load_workflow(self, path: str) -> Workflow:
        from pathlib import Path

        definition = WorkflowParser.parse(Path(path))

        skills = self._skill_registry.resolve(
            definition.skill_ids
        )

        return Workflow(
            definition = definition,
            skills = skills,
        )

    # Execute a workflow and return its context after execution.
    def run(
        self,
        workflow: Workflow,
        context: AgentContext | None = None,
        ) -> AgentContext:

        if context is None:
            context = AgentContext()

        workflow.execute(context)

        return context