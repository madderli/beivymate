from beivymate.runtime.context import AgentContext
from beivymate.runtime.llm.gateway import LLMGateway
from beivymate.runtime.llm.models import ChatMessage, LLMRequest
from beivymate.runtime.skill import Skill


# Tester-specific requirement understanding capability.
# This skill analyzes a requirement from the perspective of asoftware tester and stores the result in AgentContext.
class TesterRequirementUnderstandingSkill(Skill):

    def __init__(
        self,
        gateway: LLMGateway,
        model: str,
    ) -> None:
        self._gateway = gateway
        self._model = model

    def execute(self, context: AgentContext) -> None:
        requirement = context.get("requirement")

        if requirement is None:
            raise ValueError(
                "Requirement is missing from AgentContext."
            )

        requirement_data = requirement.model_dump(
            exclude_none = True
        )

        prompt = f"""
            You are a professional software tester.

            Understand the following software requirement from the perspective
            of software testing.

            Requirement:
                {requirement_data}

            Please provide a structured requirement understanding including:

            1. Functional objective
            2. Actors / roles
            3. Main business flow
            4. Business rules
            5. Preconditions
            6. Input and output
            7. State changes
            8. Exception scenarios
            9. Boundary conditions
            10. Dependencies
            11. Potential risks
            12. Ambiguous or missing requirements

            Focus on understanding the requirement.

            Do not design test cases yet.
            Do not execute tests.
        """

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
        )

        response = self._gateway.chat(request)

        context.set(
            "tester_requirement_understanding",
            response.content,
        )