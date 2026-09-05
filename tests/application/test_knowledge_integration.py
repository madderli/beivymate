from pathlib import Path

import beivymate.application.composition as composition

from beivymate.application.composition import create_tester_agent
from beivymate.model.entity.requirement import Requirement
from beivymate.runtime.llm.models import LLMResponse


class FakeLLMGateway:

    def __init__(self) -> None:
        self.last_request = None

    def chat(self, request):
        self.last_request = request

        return LLMResponse(
            model = request.model,
            content = "Requirement analysis result.",
        )


def test_tester_agent_uses_runtime_knowledge(
    tmp_path,
    monkeypatch,
):
    knowledge_root = (
        tmp_path
        / "knowledge"
    )

    knowledge_root.mkdir()

    knowledge_file = (
        knowledge_root
        / "his_payment.md"
    )

    knowledge_file.write_text(
        """---
        id: his_payment
        name: HIS Payment Knowledge
        description: HIS outpatient payment knowledge
        category: product
        roles:
            - tester
        scope: global
        nature: operational
        locale: zh-CN
        version: 1.0
        source_type: markdown
        ---

        门诊微信支付成功后，应更新患者结算状态。
        支付测试应关注重复支付和支付状态一致性。
        """,
        encoding = "utf-8",
    )

    workflow_file = (
        tmp_path
        / "workflow.md"
    )

    workflow_file.write_text(
        """---
        id: tester_knowledge_integration
        name: Tester Knowledge Integration
        description: Tester knowledge integration workflow
        steps:
            - tester_requirement_understanding
        ---
        """,
        encoding = "utf-8",
    )

    monkeypatch.setattr(
        composition,
        "KNOWLEDGE_ROOT",
        knowledge_root,
    )

    gateway = FakeLLMGateway()

    agent = create_tester_agent(
        workflow_path = str(
            workflow_file
        ),
        gateway = gateway,
        model = "test-model",
        locale = "zh-CN",
    )

    requirement = Requirement(
        id = "REQ001",
        title = "新增门诊患者微信支付功能",
        content = (
            "HIS系统新增门诊患者微信支付功能"
        ),
    )

    context = agent.run(
        requirement
    )

    assert gateway.last_request is not None

    user_message = next(
        message
        for message
        in gateway.last_request.messages
        if message.role == "user"
    )

    prompt = user_message.content

    assert "Relevant Knowledge:" in prompt

    assert "his_payment" in prompt

    assert (
        "门诊微信支付成功后，应更新患者结算状态。"
        in prompt
    )

    assert (
        "支付测试应关注重复支付和支付状态一致性。"
        in prompt
    )

    knowledge = context.get_knowledge()

    assert len(knowledge) == 1
    assert knowledge[0].id == "his_payment"

    assert (
        context.get_role()
        == "tester"
    )

    assert (
        context.get_locale()
        == "zh-CN"
    )

    assert (
        context.get_scope()
        == "global"
    )