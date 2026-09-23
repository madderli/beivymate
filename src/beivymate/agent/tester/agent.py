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

        # Convenience generation still uses durable authorization/review checkpoints.
        from uuid import uuid4
        from beivymate.documents.defaults import data_directory
        checkpoint = data_directory() / "runs" / uuid4().hex / "checkpoint.json"
        checkpoint.parent.mkdir(parents=True, exist_ok=True)
        state = self._runtime.start(self._workflow, context, checkpoint)
        result = AgentContext.restore(state.context)
        result.set('checkpoint_path', str(checkpoint))
        result.set('run_status', state.status)
        return result

    def start(self, requirement: Requirement | None, checkpoint_path: Path, *, task_id: str | None = None,
              context: AgentContext | None = None):
        context = AgentContext.restore(context.snapshot()) if context is not None else AgentContext()
        if requirement is not None:
            context.set("requirement", requirement)
        context.set_role("tester")
        context.set_locale(self._locale)
        context.set_scope("global")
        if task_id is not None:
            context.set("task_id", task_id)
        return self._runtime.start(self._workflow, context, checkpoint_path)

    def resume(self, checkpoint_path: Path, **decision):
        return self._runtime.resume(checkpoint_path, **decision)
