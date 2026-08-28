from beivymate.agent.tester.skills.tester_requirement_understanding import (
    TesterRequirementUnderstandingSkill,
)

from beivymate.model.entity.requirement import Requirement

from beivymate.runtime.context import AgentContext
from beivymate.runtime.llm.gateway import LLMGateway
from beivymate.runtime.llm.models import (
    LLMRequest,
    LLMResponse,
)


class FakeProvider:

    def chat(
        self,
        request: LLMRequest,
    ) -> LLMResponse:

        assert request.model == "test-model"
        assert len(request.messages) == 2

        assert request.messages[0].role == "system"
        assert request.messages[1].role == "user"

        return LLMResponse(
            model = "test-model",
            content = "Tester requirement understanding result.",
        )


def test_tester_requirement_understanding_skill():

    gateway = LLMGateway(
        provider = FakeProvider()
    )

    skill = TesterRequirementUnderstandingSkill(
        gateway = gateway,
        model = "test-model",
    )

    requirement = Requirement(
        id = "REQ-001"
        title = "新增微信支付",
        description = "患者可以使用微信完成支付。",
    )

    context = AgentContext()

    context.set(
        "requirement",
        requirement,
    )

    skill.execute(context)

    assert context.has(
        "tester_requirement_understanding"
    )

    assert context.get(
        "tester_requirement_understanding"
    ) == "Tester requirement understanding result."