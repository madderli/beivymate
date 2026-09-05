from beivymate.knowledge.models import (
    KnowledgeDocument,
    KnowledgeRequirement,
)
from beivymate.runtime.context import AgentContext


def test_context_stores_knowledge():
    context = AgentContext()

    knowledge = [
        KnowledgeDocument(
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
            source = "testing_basic.md",
            content = "Testing knowledge.",
        )
    ]

    context.set_knowledge(knowledge)

    result = context.get_knowledge()

    assert len(result) == 1
    assert result[0].id == "testing_basic"


def test_context_knowledge_defaults_to_empty_list():
    context = AgentContext()

    assert context.get_knowledge() == []


def test_context_stores_knowledge_requirements():
    context = AgentContext()

    requirements = [
        KnowledgeRequirement(
            category ="testing",
            nature = "foundational",
        ),
        KnowledgeRequirement(
            category = "product",
            nature = "operational",
        ),
    ]

    context.set_knowledge_requirements(requirements)

    result = context.get_knowledge_requirements()

    assert len(result) == 2

    assert result[0].category == "testing"
    assert result[0].nature == "foundational"

    assert result[1].category == "product"
    assert result[1].nature == "operational"


def test_context_knowledge_requirements_defaults_to_empty_list():
    context = AgentContext()

    assert context.get_knowledge_requirements() == []


def test_context_clear_removes_knowledge():
    context = AgentContext()

    knowledge = [
        KnowledgeDocument(
            id ="testing_basic",
            name = "Testing Basic",
            description = "Basic testing knowledge.",
            category = "testing",
            roles = ["tester"],
            scope = "global",
            nature = "foundational",
            locale = "zh-CN",
            version = "1.0",
            source_type = "markdown",
            source = "testing_basic.md",
            content = "Testing knowledge.",
        )
    ]

    requirements = [
        KnowledgeRequirement(
            category = "testing",
            nature = "foundational",
        )
    ]

    context.set_knowledge(knowledge)
    context.set_knowledge_requirements(requirements)

    context.clear()

    assert context.get_knowledge() == []
    assert context.get_knowledge_requirements() == []