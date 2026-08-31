from pathlib import Path

from beivymate.agent.tester.agent import TesterAgent
from beivymate.application.composition import (
    create_tester_agent,
)
from beivymate.model.entity.requirement import Requirement


class FakeLLMResponse:

    def __init__(
        self,
        content: str,
    ) -> None:

        self.content = content


class FakeLLMGateway:

    def __init__(self) -> None:

        self.last_request = None

    def chat(self, request):

        self.last_request = request

        return FakeLLMResponse(
            "Fake requirement understanding result"
        )


def create_test_workflow(
    tmp_path: Path,
) -> Path:

    workflow_file = (
        tmp_path / "smoke_test.md"
    )

    workflow_file.write_text(
        """---
        id: smoke_test
        name: Smoke Test
        escription: Test workflow.
        steps:
          - tester_requirement_understanding
        ---

        # Smoke Test
        """,
        encoding="utf-8",
    )

    return workflow_file


def create_test_template(
    tmp_path: Path,
) -> Path:

    template_file = (
        tmp_path
        / "tester_requirement_understanding.md"
    )

    template_file.write_text(
        """---
        id: tester_requirement_understanding
        name: 测试人员需求理解模板
        description: 测试人员需求理解测试模板
        role: tester
        version: "1.0"
        ---

        # 测试人员需求理解

        ## 1. 业务目标

        ## 2. 业务流程

        ## 3. 业务规则

        ## 4. 测试风险

        ## 5. 需求疑点
        """,
        encoding="utf-8",
    )

    return template_file


def test_create_tester_agent(
    tmp_path: Path,
):

    workflow_file = create_test_workflow(
        tmp_path
    )

    template_file = create_test_template(
        tmp_path
    )

    gateway = FakeLLMGateway()

    agent = create_tester_agent(
        workflow_path=str(
            workflow_file
        ),
        template_path=str(
            template_file
        ),
        gateway = gateway,
        model = "test-model",
    )

    assert isinstance(
        agent,
        TesterAgent,
    )


def test_tester_agent_executes_configured_workflow(
    tmp_path: Path,
):

    workflow_file = create_test_workflow(
        tmp_path
    )

    template_file = create_test_template(
        tmp_path
    )

    gateway = FakeLLMGateway()

    agent = create_tester_agent(
        workflow_path = str(
            workflow_file
        ),
        template_path = str(
            template_file
        ),
        gateway = gateway,
        model = "test-model",
    )

    requirement = Requirement(
        id = "REQ001",
        title = "新增微信支付",
        content = "患者可以使用微信完成支付。",
    )

    context = agent.run(
        requirement
    )

    assert (
        context.get("requirement")
        == requirement
    )

    assert (
        context.get(
            "tester_requirement_understanding"
        )
        == "Fake requirement understanding result"
    )


def test_tester_agent_uses_configured_template(
    tmp_path: Path,
):

    workflow_file = create_test_workflow(
        tmp_path
    )

    template_file = create_test_template(
        tmp_path
    )

    gateway = FakeLLMGateway()

    agent = create_tester_agent(
        workflow_path = str(
            workflow_file
        ),
        template_path = str(
            template_file
        ),
        gateway = gateway,
        model = "test-model",
    )

    requirement = Requirement(
        id = "REQ001",
        title = "新增微信支付",
        content = "患者可以使用微信完成支付。",
    )

    agent.run(
        requirement
    )

    assert gateway.last_request is not None

    prompt = (
        gateway
        .last_request
        .messages[1]
        .content
    )

    assert (
        "# 测试人员需求理解"
        in prompt
    )

    assert "## 4. 测试风险" in prompt

    assert (
        "tester_requirement_understanding"
        in prompt
    )

    assert "1.0" in prompt


def test_tester_agent_supports_custom_template(
    tmp_path: Path,
):

    workflow_file = create_test_workflow(
        tmp_path
    )

    template_file = (
        tmp_path / "company_template.md"
    )

    template_file.write_text(
        """---
        id: company_requirement_template
        name: 公司测试需求分析模板
        description: 公司自定义测试需求分析规范
        role: tester
        version: "2.0"
        ---

        # 公司测试需求分析规范

        ## 一、业务目标

        ## 二、业务流程

        ## 三、测试重点

        ## 四、风险分析

        ## 五、需求疑点
        """,
        encoding="utf-8",
    )

    gateway = FakeLLMGateway()

    agent = create_tester_agent(
        workflow_path = str(
            workflow_file
        ),
        template_path = str(
            template_file
        ),
        gateway = gateway,
        model = "test-model",
    )

    requirement = Requirement(
        id = "REQ002",
        title = "新增微信支付",
        content = "患者可以使用微信完成支付。",
    )

    agent.run(
        requirement
    )

    assert gateway.last_request is not None

    prompt = (
        gateway
        .last_request
        .messages[1]
        .content
    )

    assert (
        "# 公司测试需求分析规范"
        in prompt
    )

    assert "## 三、测试重点" in prompt

    assert (
        "company_requirement_template"
        in prompt
    )

    assert "2.0" in prompt

def test_create_tester_agent_uses_default_template(
    tmp_path: Path,
):

    workflow_file = create_test_workflow(
        tmp_path
    )

    gateway = FakeLLMGateway()

    agent = create_tester_agent(
        workflow_path = str(
            workflow_file
        ),
        gateway = gateway,
        model = "test-model",
    )

    requirement = Requirement(
        id = "REQ001",
        title = "新增微信支付",
        content = "患者可以使用微信完成支付。",
    )

    agent.run(requirement)

    assert gateway.last_request is not None

    prompt = (
        gateway
        .last_request
        .messages[1]
        .content
    )

    assert (
        "测试工程师需求理解"
        in prompt
    )