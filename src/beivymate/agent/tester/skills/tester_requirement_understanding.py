import json
from beivymate.runtime.memory import ContextBudget
from pathlib import Path
from pydantic import ValidationError

from beivymate.model.artifact.requirement_understanding import (
    SourceSnapshot, UnderstandingArtifact, UnderstandingData, decode_data,
)
from beivymate.configuration.models import (
    TemplateDefinition,
)
from beivymate.knowledge.models import(
    KnowledgeDocument, 
    KnowledgeRequirement,
)
from beivymate.model.entity.requirement import Requirement
from beivymate.runtime.context import AgentContext
from beivymate.runtime.llm.gateway import LLMGateway
from beivymate.runtime.llm.models import (
    ChatMessage,
    LLMRequest,
)
from beivymate.runtime.skill import Skill

class TesterRequirementUnderstandingSkill(Skill):

    STRATEGIES = {
        "simple": "Focus on directly relevant facts, rules and unknowns. Keep findings concise; preserve every contract field.",
        "standard": "Check all eight dimensions for applicability, main and alternative flows, dependencies and missing information.",
        "deep": "Organize findings by business object and flow; trace cross-product dependencies, project exceptions and version changes. Disclose unprocessed scope; do not claim exhaustive coverage.",
    }

    def can_auto_authorize(self) -> bool:
        return True

    def review_subject(self, context: AgentContext):
        return context.get(f"steps.{context.get('step_id')}.requirement_understanding")

    def can_auto_accept(self, context: AgentContext) -> bool:
        selection = context.get("context_selection")
        if selection is not None and selection.deferred:
            return False
        artifact = self.review_subject(context)
        if artifact is None or artifact.validation_status != "structured":
            return False
        data = artifact.require_data()
        return (data.objective_scope.status == "provided"
                and not data.unknowns
                and not any(item.basis == "inferred" for name in type(data).model_fields
                            if name != "unknowns" for item in getattr(data, name).items)
                and not any(item.blocking for item in data.unknowns)
                and all(getattr(data, name).status != "not_analyzed"
                        for name in type(data).model_fields if name != "unknowns"))

    def validate_acceptance(self, context: AgentContext) -> None:
        artifact = self.review_subject(context)
        if artifact is None:
            raise ValueError("No requirement understanding artifact")
        artifact.require_data()

    def __init__(
        self,
        gateway: LLMGateway,
        model: str,
        template: TemplateDefinition,
    ) -> None:

        self._gateway = gateway
        self._model = model
        self._template = template

    def execute(
        self,
        context: AgentContext,
    ) -> None:

        bound = context.get("step_inputs", {})
        candidates = [value for value in bound.values() if isinstance(value, Requirement)]
        if bound and len(candidates) != 1:
            raise ValueError("Requirement understanding requires exactly one bound Requirement")
        requirement = candidates[0] if bound else context.get("requirement")

        if requirement is None:
            raise ValueError(
                "Requirement is missing from AgentContext."
            )

        if not isinstance(requirement, Requirement):
            raise TypeError("AgentContext requirement must be a Requirement.")

        requirement_data = (
            requirement.model_dump(
                exclude_none = True
            )
        )

        knowledge = context.get_knowledge()
        selection = context.get("context_selection")
        # Explicit working context is additional task/run evidence, not chat history.
        if selection is not None:
            knowledge = list(knowledge)
            for item in selection.selected:
                knowledge.append(KnowledgeDocument(
                    id="context:" + item.id, name=item.id, category=item.layer, roles=["tester"],
                    nature="operational", locale=context.get_locale() or "zh-CN", version="snapshot",
                    source_type="context", source=item.source_ref, content=item.content,
                ))

        prompt = self._build_prompt(
            requirement,
            requirement_data,
            knowledge,
            context.get("analysis_strategy", "standard"),
            context.get_locale(),
        )
        if selection is not None and selection.deferred:
            prompt += "\nContext not yet analyzed due to budget: " + json.dumps(selection.deferred)
            prompt += "\nRecord these as unresolved coverage gaps; do not claim full coverage."

        request = LLMRequest(
            model = self._model,
            messages = [
                ChatMessage(
                    role = "system",
                    content = (
                        "You are a professional software tester "
                        "specialized in requirement analysis."
                    ),
                ),
                ChatMessage(
                    role = "user",
                    content = prompt,
                ),
            ],
            temperature = 0.0,
            response_schema=UnderstandingData.model_json_schema(),
        )

        budget = context.get("context_budget", ContextBudget())
        request.max_output_tokens = budget.output_reserve or None
        estimated = budget.check_request("\n".join(message.content for message in request.messages))
        context.set("context_usage_estimate", estimated)
        try:
            response = self._gateway.chat(request)
        finally:
            metric = getattr(self._gateway, "last_metric", None)
            if metric is not None:
                calls = list(context.get("llm_calls", []))
                calls.append({**metric.model_dump(mode="json"),
                              "task_id": context.get("task_id"), "run_id": context.get("run_id"),
                              "step_id": context.get("step_id"),
                              "metrics_error": getattr(self._gateway, "metrics_error", None)})
                context.set("llm_calls", calls)

        if not response.content.strip():
            raise ValueError("Requirement understanding response is empty.")

        sources = [
            SourceSnapshot.capture(
                "requirement:" + requirement.id,
                json.dumps(requirement_data, ensure_ascii=False, sort_keys=True),
                context.get("requirement_version"),
            ),
            SourceSnapshot.capture("template:" + self._template.id,
                                   self._template.content, self._template.version),
        ]
        sources.extend(SourceSnapshot.capture("knowledge:" + item.id, item.content, item.version)
                       for item in knowledge)
        metadata = dict(
            task_id=context.get("task_id"), run_id=context.get("run_id"),
            step_id=context.get("step_id", "tester_requirement_understanding"),
            requirement_id=requirement.id, model=getattr(response, "model", self._model),
            locale=context.get_locale(), sources=sources, raw_response=response.content,
        )
        try:
            artifact = UnderstandingArtifact(**metadata, data=decode_data(response.content),
                                             validation_status="structured")
        except (ValueError, ValidationError) as exc:
            artifact = UnderstandingArtifact(**metadata, validation_status="unvalidated",
                                             validation_errors=[str(exc)])

        # Optional explicit destination; output ownership moves to Runtime in later steps.
        artifact_path = context.get("requirement_understanding_artifact_path")
        if artifact_path is not None:
            artifact.save_new(Path(artifact_path))

        context.set("tester_requirement_understanding_artifact", artifact)
        quality = list(context.get("stage_quality", []))
        quality.append({"artifact_id": artifact.id, "step_id": artifact.step_id,
                        "structured_valid": artifact.validation_status == "structured",
                        "blocking_unknowns": sum(item.blocking for item in artifact.data.unknowns) if artifact.data else None})
        context.set("stage_quality", quality)
        context.set(f"steps.{artifact.step_id}.requirement_understanding", artifact)

        context.set(
            "tester_requirement_understanding",
            artifact.markdown,
        )

    def _build_prompt(
        self,
        requirement: Requirement,
        requirement_data: dict,
        knowledge: list[KnowledgeDocument],
        analysis_strategy: str = "standard",
        output_locale: str | None = None,
    ) -> str:

        knowledge_content = self._build_knowledge_content(
            knowledge
        )
        if analysis_strategy not in self.STRATEGIES:
            raise ValueError(f"Unknown analysis strategy: {analysis_strategy}")

        return f"""
            Please analyze the following software requirement
            from the perspective of a professional software tester.

            Analysis strategy: {analysis_strategy}
            {self.STRATEGIES[analysis_strategy]}
            Delivery language: {output_locale or 'use template default'}
            Always preserve the required output contract; never invent missing facts.

            Requirement:
                {requirement_data}
            
            Relevant Knowledge:
                {knowledge_content}

            Use the following requirement-understanding template
            as the analysis and output specification.

            Template:
                {self._template.content}

            Important instructions:

            1. Analyze the requirement from a testing perspective.
            2. Use the relevant knowledge as supporting context.
            3. Follow the structure and requirements defined by the template.
            4. Do not invent business requirements that are not provided.
            5. Clearly identify ambiguous, missing, or unclear requirements.
            6. Do not design test cases, execution steps, scripts or release decisions, even if the template requests them.
            7. Do not execute tests.

            Requirement ID:
                {requirement.id}

            Template ID:
                {self._template.id}

            Template Version:
                {self._template.version}

            Machine-readable output contract (takes precedence over template formatting):
            Return a single JSON object matching this schema, without a separate report.
            Use the template for analytical guidance. Use the requested language for text values.
            Distinguish explicit facts from inferences. Explain unavailable or inapplicable sections.
            Source references must be one of:
                {['requirement:' + requirement.id] + ['knowledge:' + item.id for item in knowledge]}
            Do not cite the output template as evidence for a business fact.
            Do not generate IDs, timestamps, approval decisions or other system metadata.
            Schema:
                {json.dumps(UnderstandingData.model_json_schema(), ensure_ascii=False)}
        """.strip()


    def knowledge_requirements(
        self,
    ) -> list[KnowledgeRequirement]:
        return [
            KnowledgeRequirement(
                category = "testing",
                nature = "foundational",
            ),
            KnowledgeRequirement(
                category = "domain",
                nature = "foundational",
            ),
            KnowledgeRequirement(
                category = "product",
                nature = "operational",
            ),
            KnowledgeRequirement(
                category = "customer",
                nature = "operational",
            ),
        ]

    def _build_knowledge_content(
        self,
        knowledge: list[KnowledgeDocument],
    ) -> str:

        if not knowledge:
            return "No relevant knowledge provided."

        sections: list[str] = []

        for document in knowledge:
            sections.append(
                f"""
                Knowledge ID: {document.id}
                Category: {document.category}
                Nature: {document.nature}
                Content:
                {document.content}
                """.strip()
            )

        return "\n\n".join(sections)
