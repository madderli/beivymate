from pathlib import Path

from beivymate.knowledge.discovery import KnowledgeDiscovery

def write_knowledge(
    path: Path,
    *,
    knowledge_id: str,
    category: str,
    role: str,
    nature: str,
):
    path.parent.mkdir(parents=True, exist_ok=True)

    path.write_text(
        f"""---
        id: {knowledge_id}
        name: {knowledge_id}
        category: {category}
        roles:
          - {role}
        cope: global
        nature: {nature}
        locale: zh-CN
        version: "1.0"
        source_type: markdown
        ---

        # {knowledge_id}

        Knowledge content.
        """,
        encoding = "utf-8",
    )


def test_discover_all_markdown_knowledge(tmp_path: Path):
    root = tmp_path / "knowledge"

    write_knowledge(
        root / "testing" / "test_design.md",
        knowledge_id = "test_design",
        category = "testing",
        role = "tester",
        nature = "foundational",
    )

    write_knowledge(
        root / "it" / "it_basic.md",
        knowledge_id = "it_basic",
        category = "it",
        role = "shared",
        nature = "foundational",
    )

    write_knowledge(
        root / "customer" / "hospital_a.md",
        knowledge_id = "hospital_a",
        category = "customer",
        role = "tester",
        nature = "operational",
    )

    documents = KnowledgeDiscovery().discover(root)

    assert len(documents) == 3

    ids = {document.id for document in documents}

    assert ids == {
        "test_design",
        "it_basic",
        "hospital_a",
    }


def test_discover_empty_directory(tmp_path: Path):
    root = tmp_path / "knowledge"
    root.mkdir()

    documents = KnowledgeDiscovery().discover(root)

    assert documents == []


def test_discover_missing_directory(tmp_path: Path):
    root = tmp_path / "knowledge"

    documents = KnowledgeDiscovery().discover(root)

    assert documents == []