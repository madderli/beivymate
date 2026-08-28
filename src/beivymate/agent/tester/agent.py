from beivymate.model.entity.requirement import Requirement
from beivymate.runtime.context import AgentContext
from beivymate.runtime.runtime import Runtime
from beivymate.runtime.workflow import Workflow

# AI software testing agent.
class TesterAgent:

    def __init__(
        self,
        runtime: Runtime,
        workflow: Workflow,
    ) -> None:
        self._runtime = runtime
        self._workflow = workflow

    def run(self, requirement: Requirement) -> AgentContext:
        context = AgentContext()
        context.set("requirement", requirement)

        return self._runtime.run(
            workflow = self._workflow,
            context = context,
        )