from beivymate.knowledge.models import KnowledgeDocument
from beivymate.runtime.context import AgentContext


def test_context_stores_and_retrieves_knowledge():
    context = AgentContext()

    knowledge = KnowledgeDocument(
        id = "testing_basic",
        name = "Testing Basic",
        description = "Basic testing knowledge.",
        category = "testing",
        roles = ["tester"],
        scope = "global",
        nature = "foundational",
        locale = "zh-CN",
        version = "1.0",
        source_type = "markdown",
        source = "resources/knowledge/testing/testing_basic.md",
        content = "This is testing knowledge.",
    )

    context.set_knowledge([knowledge])

    result = context.get_knowledge()

    assert len(result) == 1
    assert result[0].id == "testing_basic"
    assert result[0].category == "testing"

def test_context_returns_empty_knowledge_by_default():
    context = AgentContext()

    assert context.get_knowledge() == []


def test_context_clear_removes_knowledge():
    context = AgentContext()

    knowledge = KnowledgeDocument(
        id = "testing_basic",
        name = "Testing Basic",
        description = "Basic testing knowledge.",
        category = "testing",
        roles = ["tester"],
        scope = "global",
        nature = "foundational",
        locale = "zh-CN",
        version = "1.0",
        source_type = "markdown",
        source = "resources/knowledge/testing/testing_basic.md",
        content = "This is testing knowledge.",
    )

    context.set_knowledge([knowledge])

    assert context.get_knowledge()

    context.clear()

    assert context.get_knowledge() == []
