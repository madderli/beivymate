from pathlib import Path

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
        locale: str,
    ) -> None:
        self._runtime = runtime
        self._workflow = workflow
        self._locale = locale

    def run(
        self,
        requirement: Requirement,
    ) -> AgentContext:

        context = AgentContext()

        context.set(
            "requirement",
            requirement,
        )

        context.set_role(
            "tester"
        )

        context.set_locale(
            self._locale
        )

        context.set_scope(
            "global"
        )

        return self._runtime.run(
            workflow = self._workflow,
            context = context,
        )

    def start(self, requirement: Requirement, checkpoint_path: Path, *, task_id: str | None = None):
        context = AgentContext()
        context.set("requirement", requirement)
        context.set_role("tester")
        context.set_locale(self._locale)
        context.set_scope("global")
        if task_id is not None:
            context.set("task_id", task_id)
        return self._runtime.start(self._workflow, context, checkpoint_path)

    def resume(self, checkpoint_path: Path, **decision):
        return self._runtime.resume(checkpoint_path, **decision)
