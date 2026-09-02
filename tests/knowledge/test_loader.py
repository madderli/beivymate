from pathlib import Path

import pytest

from beivymate.knowledge.loader import MarkdownKnowledgeLoader


def test_load_markdown_knowledge(tmp_path: Path):
    path = tmp_path / "test_design_basic.md"

    path.write_text(
        """---
        id: test_design_basic
        name: 测试设计基础
        description: 软件测试中的基本测试设计知识。
        category: testing
        roles:
            - tester
        scope: global
        nature: foundational
        locale: zh-CN
        version: "1.0"
        source_type: markdown
        ---

        # 测试设计基础

        测试设计用于将测试目标转化为可执行的测试条件。
        """,
        encoding = "utf-8",
    )

    document = MarkdownKnowledgeLoader().load(path)

    assert document.id == "test_design_basic"
    assert document.name == "测试设计基础"
    assert document.category == "testing"
    assert document.roles == ["tester"]
    assert document.scope == "global"
    assert document.nature == "foundational"
    assert document.locale == "zh-CN"
    assert document.version == "1.0"
    assert document.source_type == "markdown"
    assert document.source == str(path)

    assert "# 测试设计基础" in document.content
    assert "测试设计用于将测试目标转化为可执行的测试条件。" in document.content


def test_loader_supports_shared_knowledge(tmp_path: Path):
    path = tmp_path / "shared.md"

    path.write_text(
        """---
        id: shared_it_basic
        name: IT基础知识
        category: it
        roles:
            - shared
        scope: global
        nature: foundational
        locale: zh-CN
        version: "1.0"
        source_type: markdown
        ---

        # IT基础知识
        """,
        encoding = "utf-8",
    )

    document = MarkdownKnowledgeLoader().load(path)

    assert document.roles == ["shared"]


def test_loader_rejects_markdown_without_metadata(tmp_path: Path):
    path = tmp_path / "invalid.md"

    path.write_text(
        "# Invalid Knowledge\n",
        encoding="utf-8",
    )

    with pytest.raises(ValueError):
        MarkdownKnowledgeLoader().load(path)


def test_loader_rejects_unclosed_metadata(tmp_path: Path):
    path = tmp_path / "invalid.md"

    path.write_text(
        """---
        id: invalid
        name: Invalid
        """,
        encoding = "utf-8",
    )

    with pytest.raises(ValueError):
        MarkdownKnowledgeLoader().load(path)


def test_loader_rejects_non_markdown_file(tmp_path: Path):
    path = tmp_path / "knowledge.txt"
    path.write_text("knowledge", encoding="utf-8")

    with pytest.raises(ValueError):
        MarkdownKnowledgeLoader().load(path)