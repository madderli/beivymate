from beivymate.runtime.context import AgentContext


def test_context_execution_context():

    context = AgentContext()

    context.set_role("tester")
    context.set_locale("zh-CN")
    context.set_scope("product:his")

    assert context.get_role() == "tester"
    assert context.get_locale() == "zh-CN"
    assert context.get_scope() == "product:his"


def test_context_scope_defaults_to_global():

    context = AgentContext()

    assert context.get_scope() == "global"