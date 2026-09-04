from beivymate.agent.tester.agent import TesterAgent
from beivymate.model.entity.requirement import Requirement
from beivymate.runtime.context import AgentContext
from beivymate.runtime.runtime import Runtime
from beivymate.runtime.workflow import Workflow


class FakeRuntime:

    def __init__(self) -> None:
        self.received_context = None

    def run(
        self,
        workflow,
        context=None,
    ):

        self.received_context = context

        return context


def test_tester_agent_accepts_requirement():

    requirement = Requirement(
        id = "REQ001",
        title = "新增微信支付",
        content = "患者可以使用微信完成支付。",
    )

    runtime = FakeRuntime()

    workflow = object.__new__(Workflow)

    agent = TesterAgent(
        runtime = runtime,
        workflow = workflow,
        locale = "zh-CN",
    )

    result = agent.run(requirement)

    assert isinstance(
        result,
        AgentContext,
    )

    assert (
        result.get("requirement")
        == requirement
    )

    assert (
        runtime.received_context
        is result
    )