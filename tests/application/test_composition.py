from pathlib import Path

from beivymate.agent.tester.agent import TesterAgent
from beivymate.application.composition import (
    create_tester_agent,
)
from beivymate.model.entity.requirement import Requirement


class FakeLLMResponse:

    def __init__(self, content: str) -> None:
        self.content = content


class FakeLLMGateway:

    def chat(self, request):
        return FakeLLMResponse(
            "Fake requirement understanding result"
        )


def test_create_tester_agent(tmp_path: Path):

    workflow_file = tmp_path / "smoke_test.md"

    workflow_file.write_text(
        """---
        id: smoke_test
        name: Smoke Test
        description: Test workflow.
        steps:
          - tester_requirement_understanding
        ---

        # Smoke Test
        """,
        encoding="utf-8",
    )

    agent = create_tester_agent(
        workflow_path = str(workflow_file),
        gateway = FakeLLMGateway(),
        model = "test-model",
    )

    assert isinstance(
        agent,
        TesterAgent,
    )

    assert (
        agent._workflow.definition.id
        == "smoke_test"
    )

    assert len(agent._workflow.skills) == 1

    assert (
        agent._workflow.skills[0].__class__.__name__
        == "TesterRequirementUnderstandingSkill"
    )


def test_tester_agent_executes_configured_workflow(
    tmp_path: Path,
):

    workflow_file = tmp_path / "smoke_test.md"

    workflow_file.write_text(
        """---
        id: smoke_test
        name: Smoke Test
        description: Test workflow.
        steps:
          - tester_requirement_understanding
        ---

        # Smoke Test
        """,
        encoding="utf-8",
    )

    agent = create_tester_agent(
        workflow_path = str(workflow_file),
        gateway = FakeLLMGateway(),
        model = "test-model",
    )

    requirement = Requirement(
        id = "REQ001",
        title = "新增微信支付",
        content = "患者可以使用微信完成支付。",
    )

    context = agent.run(requirement)

    assert (
        context.get("requirement")
        == requirement
    )

    assert (
        context.get("tester_requirement_understanding")
        == "Fake requirement understanding result"
    )