from pathlib import Path

import pytest

from beivymate.configuration.loader import (
    load_template_definition,
)


PROJECT_ROOT = Path(__file__).resolve().parents[2]


TEMPLATE_PATH = (
    PROJECT_ROOT
    / "resources"
    / "template"
    / "tester"
    / "tester_requirement_understanding"
    / "zh-CN"
    / "DefaultTesterRequirementUnderstandingTemplate.md"
)


def test_load_default_tester_requirement_understanding_template():

    template = load_template_definition(
        TEMPLATE_PATH
    )

    assert (
        template.id
        == "default_tester_requirement_understanding"
    )

    assert (
        template.name
        == "测试工程师需求理解模板（默认模板）"
    )

    assert template.role == "tester"

    assert template.version == "1.0"

    assert template.description

    assert template.content

    assert (
        "# 测试工程师需求理解"
        in template.content
    )

    assert (
        "## 1. 模板用途"
        in template.content
    )

    assert (
        "requirement_id"
        in template.content
    )

    assert (
        "template_id"
        in template.content
    )

    assert (
        "template_version"
        in template.content
    )


def test_load_custom_template_without_code_change(
    tmp_path: Path,
):

    template_path = (
        tmp_path / "custom_template.md"
    )

    template_path.write_text(
        """---
    id: custom_tester_template
    name: 自定义测试需求理解模板
    description: 用户自定义模板
    role: tester
    version: "2.0"
    ---

    # 自定义需求理解

    请从测试工程师角度分析需求。

    ## 测试关注点

    识别主要测试风险。
    """,
        encoding = "utf-8",
    )

    template = load_template_definition(
        template_path
    )

    assert template.id == "custom_tester_template"

    assert (
        template.name
        == "自定义测试需求理解模板"
    )

    assert (
        template.description
        == "用户自定义模板"
    )

    assert template.role == "tester"

    assert template.version == "2.0"

    assert (
        "# 自定义需求理解"
        in template.content
    )

    assert (
        "## 测试关注点"
        in template.content
    )


def test_template_requires_metadata_delimiter(
    tmp_path: Path,
):

    template_path = (
        tmp_path / "invalid.md"
    )

    template_path.write_text(
        "# Invalid Template",
        encoding = "utf-8",
    )

    with pytest.raises(
        ValueError,
        match = "must start with metadata delimiter",
    ):
        load_template_definition(
            template_path
        )


def test_template_requires_closing_metadata_delimiter(
    tmp_path: Path,
):

    template_path = (
        tmp_path / "invalid.md"
    )

    template_path.write_text(
        """---
    id: invalid_template
    name: Invalid Template
    role: tester
    version: "1.0"

    # Template
    """,
        encoding = "utf-8",
    )

    with pytest.raises(
        ValueError,
        match = "has no closing metadata delimiter",
    ):
        load_template_definition(
            template_path
        )


def test_template_requires_required_metadata(
    tmp_path: Path,
):

    template_path = (
        tmp_path / "invalid.md"
    )

    template_path.write_text(
        """---
    id: invalid_template
    name: Invalid Template
    role: tester
    ---

    # Template
    """,
        encoding = "utf-8",
    )

    with pytest.raises(
        ValueError,
    ):
        load_template_definition(
            template_path
        )
