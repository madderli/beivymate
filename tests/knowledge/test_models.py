import pytest
from pydantic import ValidationError

from beivymate.knowledge.models import KnowledgeDocument


def create_document(**overrides) -> KnowledgeDocument:
    data = {
        "id": "test_design_basic",
        "name": "测试设计基础",
        "description": "测试设计基础知识",
        "category": "testing",
        "roles": ["tester"],
        "scope": "global",
        "nature": "foundational",
        "locale": "zh-CN",
        "version": "1.0",
        "source_type": "markdown",
        "source": "resources/knowledge/testing/test_design_basic.md",
        "content": "# 测试设计基础",
    }

    data.update(overrides)

    return KnowledgeDocument(**data)


def test_knowledge_document_can_be_created():
    document = create_document()

    assert document.id == "test_design_basic"
    assert document.category == "testing"
    assert document.roles == ["tester"]
    assert document.nature == "foundational"
    assert document.locale == "zh-CN"


def test_knowledge_document_supports_operational_knowledge():
    document = create_document(
        nature = "operational",
        category = "customer",
        roles = ["tester"],
        scope = "customer:hospital_a",
    )

    assert document.nature == "operational"
    assert document.category == "customer"
    assert document.scope == "customer:hospital_a"


def test_knowledge_document_rejects_invalid_nature():
    with pytest.raises(ValidationError):
        create_document(nature = "temporary")