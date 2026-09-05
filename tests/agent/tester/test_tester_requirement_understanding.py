from pathlib import Path

from beivymate.configuration.loader import (
    load_template_definition,
)
from beivymate.configuration.models import TemplateDefinition
from beivymate.knowledge.models import KnowledgeDocument
from beivymate.model.entity.requirement import Requirement
from beivymate.runtime.context import AgentContext

from beivymate.agent.tester.skills.tester_requirement_understanding import (
    TesterRequirementUnderstandingSkill,
)
from beivymate.runtime.llm.models import LLMResponse


class FakeResponse:

    def __init__(
        self,
        content: str,
    ) -> None:

        self.content = content


class FakeLLMGateway:

    def __init__(self) -> None:

        self.last_request = None

    def chat(
        self,
        request,
    ):

        self.last_request = request

        return LLMResponse(
            model = request.model,
            content = "测试需求理解结果"
        )


def create_template() -> TemplateDefinition:
    return TemplateDefinition(
        id = "tester_requirement_understanding",
        name = "Tester Requirement Understanding",
        description = "Requirement understanding template.",
        role = "tester",
        version = "1.0",
        content = "Analyze requirement scope and risks.",
    )


def test_tester_requirement_understanding_declares_knowledge_requirements():
    gateway = FakeLLMGateway()

    skill = TesterRequirementUnderstandingSkill(
        gateway = gateway,
        model = "test-model",
        template = create_template(),
    )

    requirements = skill.knowledge_requirements()

    assert len(requirements) == 4

    assert (
        requirements[0].category,
        requirements[0].nature,
    ) == (
        "testing",
        "foundational",
    )

    assert (
        requirements[1].category,
        requirements[1].nature,
    ) == (
        "domain",
        "foundational",
    )

    assert (
        requirements[2].category,
        requirements[2].nature,
    ) == (
        "product",
        "operational",
    )

    assert (
        requirements[3].category,
        requirements[3].nature,
    ) == (
        "customer",
        "operational",
    )


def test_skill_uses_template():

    template = load_template_definition(
        Path(
            "resources/template/tester/"
            "tester_requirement_understanding/"
            "zh-CN/DefaultTesterRequirementUnderstandingTemplate.md"
        )
    )

    gateway = FakeLLMGateway()

    skill = TesterRequirementUnderstandingSkill(
        gateway = gateway,
        model = "test-model",
        template = template,
    )

    requirement = Requirement(
        id = "REQ001",
        title = "新增门诊患者微信支付功能",
        content = (
            "HIS系统新增门诊患者微信支付功能"
        ),
    )

    context = AgentContext()

    context.set(
        "requirement",
        requirement,
    )

    skill.execute(context)

    assert gateway.last_request is not None

    prompt = (
        gateway.last_request.messages[1].content
    )

    assert template.content in prompt

    assert template.id in prompt

    assert template.version in prompt

    assert "REQ001" in prompt

    assert (
        "新增门诊患者微信支付功能"
        in prompt
    )


def test_skill_writes_result_to_context():

    template = load_template_definition(
        Path(
            "resources/template/tester/"
            "tester_requirement_understanding/"
            "zh-CN/DefaultTesterRequirementUnderstandingTemplate.md"
        )
    )

    gateway = FakeLLMGateway()

    skill = TesterRequirementUnderstandingSkill(
        gateway = gateway,
        model = "test-model",
        template = template,
    )

    requirement = Requirement(
        id = "REQ001",
        title = "新增微信支付",
        content = "患者可以使用微信完成支付。",
    )

    context = AgentContext()

    context.set(
        "requirement",
        requirement,
    )

    skill.execute(context)

    result = context.get(
        "tester_requirement_understanding"
    )

    assert result == "测试需求理解结果"


def test_skill_requires_requirement():

    template = load_template_definition(
        Path(
            "resources/template/tester/"
            "tester_requirement_understanding/"
            "zh-CN/DefaultTesterRequirementUnderstandingTemplate.md"
        )
    )

    gateway = FakeLLMGateway()

    skill = TesterRequirementUnderstandingSkill(
        gateway = gateway,
        model = "test-model",
        template = template,
    )

    context = AgentContext()

    try:
        skill.execute(context)
        assert False
    except ValueError as exc:
        assert (
            str(exc)
            == "Requirement is missing from AgentContext."
        )

def test_skill_supports_custom_template(
    tmp_path: Path,
):

    template_path = (
        tmp_path / "custom.md"
    )

    template_path.write_text(
        """---
        id: company_tester_template
        name: 公司测试需求分析模板
        description: 公司自己的需求分析规范
        role: tester
        version: "2.0"
        ---

        # 公司测试需求分析规范

        ## 一、业务目标

        ## 二、业务流程

        ## 三、测试风险

        ## 四、需求疑点
        """,
        encoding="utf-8",
    )

    template = load_template_definition(
        template_path
    )

    gateway = FakeLLMGateway()

    skill = TesterRequirementUnderstandingSkill(
        gateway=gateway,
        model="test-model",
        template=template,
    )

    requirement = Requirement(
        id="REQ002",
        title="新增微信支付",
        content="患者可以使用微信完成支付。",
    )

    context = AgentContext()

    context.set(
        "requirement",
        requirement,
    )

    skill.execute(context)

    prompt = (
        gateway.last_request.messages[1].content
    )

    assert (
        "# 公司测试需求分析规范"
        in prompt
    )

    assert "## 三、测试风险" in prompt

    assert (
        "company_tester_template"
        in prompt
    )

    assert "2.0" in prompt


def test_tester_requirement_understanding_includes_knowledge_in_prompt():
    gateway = FakeLLMGateway()

    skill = TesterRequirementUnderstandingSkill(
        gateway = gateway,
        model = "test-model",
        template = create_template(),
    )

    context = AgentContext()

    context.set(
        "requirement",
        Requirement(
            id = "REQ-001",
            title = "WeChat Payment",
            content = (
                "HIS supports outpatient patient "
                "WeChat payment."
            ),
        ),
    )

    context.set_knowledge(
        [
            KnowledgeDocument(
                id = "testing_basic",
                name = "Testing Basic",
                description = "Testing knowledge.",
                category = "testing",
                roles = ["tester"],
                scope = "global",
                nature = "foundational",
                locale = "zh-CN",
                version = "1.0",
                source_type = "markdown",
                source = "testing_basic.md",
                content = (
                    "Payment testing should consider "
                    "success, failure, cancellation, "
                    "and duplicate payment."
                ),
            ),
            KnowledgeDocument(
                id = "his_payment",
                name = "HIS Payment",
                description = "HIS payment knowledge.",
                category = "product",
                roles = ["tester"],
                scope = "global",
                nature = "operational",
                locale = "zh-CN",
                version = "1.0",
                source_type = "markdown",
                source = "his_payment.md",
                content = (
                    "Outpatient payment updates "
                    "the patient settlement status."
                ),
            ),
        ]
    )

    skill.execute(context)

    assert gateway.last_request is not None

    user_message = gateway.last_request.messages[1].content

    assert "Relevant Knowledge:" in user_message

    assert "testing_basic" in user_message
    assert "Payment testing should consider" in user_message

    assert "his_payment" in user_message
    assert "Outpatient payment updates" in user_message


def test_tester_requirement_understanding_includes_knowledge_in_prompt():
    gateway = FakeLLMGateway()

    skill = TesterRequirementUnderstandingSkill(
        gateway = gateway,
        model = "test-model",
        template = create_template(),
    )

    context = AgentContext()

    context.set(
        "requirement",
        Requirement(
            id ="REQ-001",
            title = "WeChat Payment",
            content = (
                "HIS supports outpatient patient "
                "WeChat payment."
            ),
        ),
    )

    context.set_knowledge(
        [
            KnowledgeDocument(
                id = "testing_basic",
                name = "Testing Basic",
                description = "Testing knowledge.",
                category = "testing",
                roles = ["tester"],
                scope = "global",
                nature = "foundational",
                locale = "zh-CN",
                version = "1.0",
                source_type = "markdown",
                source = "testing_basic.md",
                content = (
                    "Payment testing should consider "
                    "success, failure, cancellation, "
                    "and duplicate payment."
                ),
            ),
            KnowledgeDocument(
                id = "his_payment",
                name = "HIS Payment",
                description = "HIS payment knowledge.",
                category = "product",
                roles = ["tester"],
                scope = "global",
                nature = "operational",
                locale = "zh-CN",
                version = "1.0",
                source_type = "markdown",
                source = "his_payment.md",
                content = (
                    "Outpatient payment updates "
                    "the patient settlement status."
                ),
            ),
        ]
    )

    skill.execute(context)

    assert gateway.last_request is not None

    user_message = gateway.last_request.messages[1].content

    assert "Relevant Knowledge:" in user_message

    assert "testing_basic" in user_message
    assert "Payment testing should consider" in user_message

    assert "his_payment" in user_message
    assert "Outpatient payment updates" in user_message


def test_tester_requirement_understanding_runs_without_knowledge():
    gateway = FakeLLMGateway()

    skill = TesterRequirementUnderstandingSkill(
        gateway = gateway,
        model = "test-model",
        template = create_template(),
    )

    context = AgentContext()

    context.set(
        "requirement",
        Requirement(
            id = "REQ-001",
            title = "Test Requirement",
            content = "Test requirement content.",
        ),
    )

    skill.execute(context)

    assert gateway.last_request is not None

    user_message = gateway.last_request.messages[1].content

    assert "No relevant knowledge provided." in user_message