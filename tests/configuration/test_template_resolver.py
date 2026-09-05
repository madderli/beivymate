from pathlib import Path

import pytest

from beivymate.configuration.template_resolver import (
    TemplateResolver,
)


def test_resolve_default_template(
    tmp_path: Path,
):

    template_root = (
        tmp_path / "template"
    )

    template_path = (
        template_root
        / "tester"
        / "tester_requirement_understanding"
        / "zh-CN"
        / "DefaultTesterRequirementUnderstandingTemplate.md"
    )

    template_path.parent.mkdir(
        parents = True,
    )

    template_path.write_text(
        """---
        id: default_tester_requirement_understanding
        name: 测试工程师需求理解模板
        description: 默认模板
        role: tester
        version: "1.0"
        ---

        # 测试工程师需求理解
        """,
        encoding = "utf-8",
    )

    resolver = TemplateResolver(
        template_root = template_root,
    )

    result = resolver.resolve_default(
        role = "tester",
        template_name = "tester_requirement_understanding",
        locale = "zh-CN",
    )

    assert result == template_path


def test_resolve_default_template_not_found(
    tmp_path: Path,
):

    resolver = TemplateResolver(
        template_root = tmp_path,
    )

    with pytest.raises(
        FileNotFoundError,
    ):

        resolver.resolve_default(
            role = "tester",
            template_name = "tester_requirement_understanding",
            locale = "zh-CN",
        )


def test_resolve_default_template_for_different_locale(
    tmp_path: Path,
):

    template_root = (
        tmp_path / "template"
    )

    zh_template = (
        template_root
        / "tester"
        / "tester_requirement_understanding"
        / "zh-CN"
        / "DefaultTesterRequirementUnderstandingTemplate.md"
    )

    en_template = (
        template_root
        / "tester"
        / "tester_requirement_understanding"
        / "en-US"
        / "DefaultTesterRequirementUnderstandingTemplate.md"
    )

    zh_template.parent.mkdir(
        parents = True,
    )

    en_template.parent.mkdir(
        parents = True,
    )

    zh_template.write_text(
        "Chinese template",
        encoding = "utf-8",
    )

    en_template.write_text(
        "English template",
        encoding = "utf-8",
    )

    resolver = TemplateResolver(
        template_root = template_root,
    )

    zh_result = resolver.resolve_default(
        role = "tester",
        template_name = "tester_requirement_understanding",
        locale = "zh-CN",
    )

    en_result = resolver.resolve_default(
        role = "tester",
        template_name = "tester_requirement_understanding",
        locale = "en-US",
    )

    assert zh_result == zh_template

    assert en_result == en_template