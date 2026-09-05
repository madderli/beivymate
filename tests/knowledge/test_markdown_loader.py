from pathlib import Path

import pytest

from beivymate.knowledge.loaders import (
    MarkdownKnowledgeLoader,
)


def test_load_markdown_knowledge(
    tmp_path: Path,
):

    path = (
        tmp_path
        / "test_design_basic.md"
    )

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
        ---

        # 测试设计基础

        测试设计用于将测试目标转化为可执行的测试条件。
        """,
        encoding = "utf-8",
    )

    documents = (
        MarkdownKnowledgeLoader()
        .load(path)
    )

    assert len(documents) == 1

    document = documents[0]

    assert (
        document.id
        == "test_design_basic"
    )

    assert (
        document.name
        == "测试设计基础"
    )

    assert (
        document.category
        == "testing"
    )

    assert document.roles == [
        "tester"
    ]

    assert (
        document.scope
        == "global"
    )

    assert (
        document.nature
        == "foundational"
    )

    assert (
        document.locale
        == "zh-CN"
    )

    assert (
        document.version
        == "1.0"
    )

    assert (
        document.source_type
        == "markdown"
    )

    assert (
        document.source
        == str(path)
    )

    assert (
        "# 测试设计基础"
        in document.content
    )


def test_markdown_loader_supports_md():

    loader = (
        MarkdownKnowledgeLoader()
    )

    assert loader.supports(
        Path("knowledge.md")
    )


def test_markdown_loader_does_not_support_metadata_sidecar():

    loader = (
        MarkdownKnowledgeLoader()
    )

    assert not loader.supports(
        Path("knowledge.meta.md")
    )


def test_markdown_loader_rejects_non_markdown_file(
    tmp_path: Path,
):

    path = (
        tmp_path
        / "knowledge.txt"
    )

    path.write_text(
        "knowledge",
        encoding = "utf-8",
    )

    with pytest.raises(
        ValueError
    ):
        MarkdownKnowledgeLoader().load(
            path
        )