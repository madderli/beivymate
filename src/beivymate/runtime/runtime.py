from pathlib import Path

from beivymate.configuration.loader import load_workflow_definition
from beivymate.knowledge.models import KnowledgeDocument, KnowledgeQuery
from beivymate.knowledge.service import KnowledgeService
from beivymate.runtime.context import AgentContext
from beivymate.runtime.skill_registry import SkillRegistry
from beivymate.runtime.workflow import Workflow
from beivymate.runtime.checkpoint import Checkpoint, Decision, digest, exclusive_resume
from beivymate.runtime.memory import select_context


# Execute the workflow within agent runtime.
class Runtime:

    def __init__(
        self,
        skill_registry: SkillRegistry,
        knowledge_service: KnowledgeService | None = None,
    ) -> None:
        self._skill_registry = skill_registry
        self._knowledge_service = knowledge_service

    # Load a workflow from user configuration.
    def load_workflow(
        self,
        path: str,
    ) -> Workflow:

        definition = load_workflow_definition(
            Path(path)
        )

        skills = self._skill_registry.resolve(
            [step.skill for step in definition.resolved_steps()]
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
        if workflow.definition.step_definitions:
            raise ValueError("Configured workflow requires start(..., checkpoint_path) and resume()")
        return self._execute(workflow, context)

    def _execute(self, workflow: Workflow, context: AgentContext | None = None) -> AgentContext:
        
        if context is None:
            context = AgentContext()

        for step, skill in zip(workflow.definition.resolved_steps(), workflow.skills):
            missing = [ref for ref in step.inputs if not context.has(ref) or context.get(ref) is None]
            if missing:
                raise ValueError(f"Step {step.id} is missing inputs: {', '.join(missing)}")
            context.set("step_id", step.id)
            context.set("step_inputs", {ref: context.get(ref) for ref in step.inputs})
            context.set("analysis_strategy", step.analysis_strategy)
            context.set("review_mode", step.review_mode)
            context.set("authorization_mode", step.authorization_mode)
            if context.has("context_items"):
                selection = select_context(
                    context.get("context_items"), context.get("working_context_budget", 8000),
                    workspace_ids=context.get("workspace_ids", []), targets=context.get("target_versions", {}),
                    project_id=context.get("project_id"), task_id=context.get("task_id"), run_id=context.get("run_id"),
                )
                context.set("context_selection", selection)
            requirements = skill.knowledge_requirements()

            context.set_knowledge_requirements(requirements)

            knowledge_by_id: dict[str, KnowledgeDocument] = {}

            if (
                requirements is not None
                and self._knowledge_service is not None
            ):
                role = context.get_role()
                locale = context.get_locale()

                if role is not None and locale is not None:
                    for requirement in requirements:    
                        query = KnowledgeQuery(
                            role = role,
                            locale = locale,
                            scope = context.get_scope(),
                            category = requirement.category,
                            nature = requirement.nature,
                        )

                        selected = self._knowledge_service.select(query)

                        for document in selected:
                            knowledge_by_id[document.id] = document

            context.set_knowledge(
                context.get("frozen_knowledge", list(knowledge_by_id.values()))
            )

            skill.execute(context)

        return context

    def start(self, workflow: Workflow, context: AgentContext, checkpoint_path: Path,
              *, review_mode: str | None = None, force_manual: bool = False) -> Checkpoint:
        """Start a durable run. Caller supplies a new path in its run directory."""
        definition = workflow.definition.model_copy(deep=True)
        if review_mode is not None and review_mode not in {"manual", "auto"}:
            raise ValueError("review_mode must be manual or auto")
        resolved = [step.model_copy(deep=True) for step in definition.resolved_steps()]
        for step in resolved:
            if review_mode is not None:
                step.review_mode = review_mode
            if force_manual:
                step.review_mode = "manual"
                step.authorization_mode = "manual"
        definition.step_definitions = resolved
        state = Checkpoint(workflow=definition, context=context.snapshot())
        context = AgentContext.restore(state.context)
        context.set("run_id", state.run_id)
        state.context = context.snapshot()
        state.write(checkpoint_path, new=True)
        return self.resume(checkpoint_path)

    @exclusive_resume
    def resume(self, checkpoint_path: Path, *, decision: str | None = None,
               actor: str | None = None, comment: str = "",
               expected_subject_hash: str | None = None) -> Checkpoint:
        """Single-writer local API; actor identity must be supplied by a trusted caller.

        An interrupted/failed tool action is never blindly replayed.
        """
        state = Checkpoint.load(checkpoint_path)
        if state.status == "executing":
            state.status = "uncertain"
            state.error = "Execution was interrupted; reconcile external effects before starting a new run"
            state.write(checkpoint_path)
            return state
        if state.status in {"completed", "failed", "uncertain", "rejected"}:
            if decision is not None:
                raise ValueError("Run is not waiting for a decision")
            return state
        context = AgentContext.restore(state.context)
        steps = state.workflow.resolved_steps()
        skills = self._skill_registry.resolve([step.skill for step in steps])

        if decision is not None:
            if state.status not in {"waiting_authorization", "waiting_review"}:
                raise ValueError("Run is not waiting for a decision")
            if decision not in {"approved", "rejected"} or not actor or not actor.strip():
                raise ValueError("A valid decision and named actor are required")
            step = steps[state.index]
            subject = context.snapshot() if state.status == "waiting_authorization" else skills[state.index].review_subject(context)
            current_hash = digest(subject)
            if expected_subject_hash != state.subject_hash or current_hash != state.subject_hash:
                raise ValueError("Decision is stale: review the current subject before confirming")
            phase = "authorization" if state.status == "waiting_authorization" else "review"
            if phase == "review" and decision == "approved":
                skills[state.index].validate_acceptance(context)
            state.decisions.append(Decision(step_id=step.id, phase=phase, decision=decision,
                mode="manual", actor=actor, comment=comment, subject_hash=current_hash,
                artifact_id=getattr(subject, "id", None), artifact_revision=getattr(subject, "revision", None)))
            if decision == "rejected":
                state.status = "rejected"
                state.write(checkpoint_path)
                return state
            if phase == "review":
                state.index += 1
            state.status = "ready"
            state.write(checkpoint_path)
        elif state.status in {"waiting_authorization", "waiting_review"}:
            return state

        while state.index < len(steps):
            step, skill = steps[state.index], skills[state.index]
            context.set("step_id", step.id)
            phase_decisions = [item for item in state.decisions if item.step_id == step.id]
            authorized = any(item.phase == "authorization" and item.decision == "approved" for item in phase_decisions)
            if not authorized:
                state.subject_hash = digest(context.snapshot())
                if step.authorization_mode == "auto" and skill.can_auto_authorize():
                    state.decisions.append(Decision(step_id=step.id, phase="authorization", decision="approved",
                        mode="auto", actor="runtime:capability-policy", subject_hash=state.subject_hash))
                else:
                    state.status = "waiting_authorization"
                    state.context = context.snapshot()
                    state.write(checkpoint_path)
                    return state
            state.status = "executing"
            state.context = context.snapshot()
            state.write(checkpoint_path)
            try:
                definition = state.workflow.model_copy(update={"steps": [step.skill], "step_definitions": [step]})
                self._execute(Workflow(definition, [skill]), context)
                subject = skill.review_subject(context)
                if subject is None:
                    raise ValueError("Skill produced no review subject")
                state.subject_hash = digest(subject)
                state.context = context.snapshot()
                if step.review_mode == "auto" and skill.can_auto_accept(context):
                    skill.validate_acceptance(context)
                    state.decisions.append(Decision(step_id=step.id, phase="review", decision="approved",
                        mode="auto", actor="runtime:acceptance-policy", subject_hash=state.subject_hash,
                        artifact_id=getattr(subject, "id", None), artifact_revision=getattr(subject, "revision", None)))
                    state.index += 1
                    state.status = "ready"
                    state.write(checkpoint_path)
                else:
                    state.status = "waiting_review"
                    state.write(checkpoint_path)
                    return state
            except Exception as exc:
                state.status = "failed"
                state.error = str(exc)
                try:
                    state.context = context.snapshot()
                except (TypeError, ValueError):
                    pass  # Preserve the last serializable state if a Skill corrupted Context.
                state.write(checkpoint_path)
                raise
        state.status = "completed"
        state.write(checkpoint_path)
        return state
