from beivymate.configuration.loader import (
    load_template_definition,
)
from beivymate.configuration.models import (
    TemplateDefinition,
)
from beivymate.model.entity.requirement import Requirement
from beivymate.runtime.context import AgentContext
from beivymate.runtime.llm.gateway import LLMGateway
from beivymate.runtime.llm.models import (
    ChatMessage,
    LLMRequest,
)


class TesterRequirementUnderstandingSkill:

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

        requirement = context.get(
            "requirement"
        )

        if requirement is None:
            raise ValueError(
                "Requirement is missing from AgentContext."
            )

        requirement_data = (
            requirement.model_dump(
                exclude_none = True
            )
        )

        prompt = self._build_prompt(
            requirement,
            requirement_data,
        )

        request = LLMRequest(
            model=self._model,
            messages=[
                ChatMessage(
                    role="system",
                    content=(
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
        )

        response = self._gateway.chat(
            request
        )

        context.set(
            "tester_requirement_understanding",
            response.content,
        )

    def _build_prompt(
        self,
        requirement: Requirement,
        requirement_data: dict,
    ) -> str:

        return f"""
            Please analyze the following software requirement
            from the perspective of a professional software tester.

            Requirement:
                {requirement_data}

            Use the following requirement-understanding template
            as the analysis and output specification.

            Template:
                {self._template.content}

            Important instructions:

            1. Analyze the requirement from a testing perspective.
            2. Follow the structure and requirements defined by the template.
            3. Do not invent business requirements that are not provided.
            4. Clearly identify ambiguous, missing, or unclear requirements.
            5. Do not design detailed test cases unless explicitly requested by the template.
            6. Do not execute tests.

            Requirement ID:
                {requirement.id}

            Template ID:
                {self._template.id}

            Template Version:
                {self._template.version}
        """.strip()