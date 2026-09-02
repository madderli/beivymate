from pathlib import Path

from beivymate.knowledge.models import KnowledgeQuery
from beivymate.knowledge.service import KnowledgeService


def test_service_loads_all_knowledge(tmp_path: Path):
    knowledge_file = tmp_path / "testing.md"

    knowledge_file.write_text(
        """---
        id: testing_basic
        name: Testing Basic
        description: Basic testing knowledge.
        category: testing
        roles:
          - tester
        scope: global
        nature: foundational
        locale: zh-CN
        version: "1.0"
        source_type: markdown
        ---

        # Testing Basic

        This is testing knowledge.
        """,
        encoding = "utf-8",
    )

    service = KnowledgeService(tmp_path)

    documents = service.load_all()

    assert len(documents) == 1
    assert documents[0].id == "testing_basic"


def test_service_selects_relevant_knowledge(tmp_path: Path):
    knowledge_file = tmp_path / "testing.md"

    knowledge_file.write_text(
        """---
        id: testing_basic
        name: Testing Basic
        description: Basic testing knowledge.
        category: testing
        roles:
          - tester
        scope: global
        nature: foundational
        locale: zh-CN
        version: "1.0"
        source_type: markdown
        ---

        # Testing Basic

        This is testing knowledge.
        """,
        encoding = "utf-8",
    )

    service = KnowledgeService(tmp_path)

    query = KnowledgeQuery(
        role = "tester",
        locale = "zh-CN",
        category = "testing",
        nature = "foundational",
    )

    documents = service.select(query)

    assert len(documents) == 1
    assert documents[0].id == "testing_basic"


def test_service_returns_empty_when_no_knowledge_matches(tmp_path: Path):
    knowledge_file = tmp_path / "testing.md"

    knowledge_file.write_text(
        """---
        id: testing_basic
        name: Testing Basic
        description: Basic testing knowledge.
        category: testing
        roles:
          - tester
        scope: global
        nature: foundational
        locale: zh-CN
        version: "1.0"
        source_type: markdown
        ---

        # Testing Basic

        This is testing knowledge.
        """,
        encoding = "utf-8",
    )

    service = KnowledgeService(tmp_path)

    query = KnowledgeQuery(
        role = "tester",
        locale = "en-US",
        category = "testing",
    )

    documents = service.select(query)

    assert documents == []