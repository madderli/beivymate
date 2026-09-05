from pathlib import Path

import pytest

from beivymate.markdown.metadata import (
    parse_markdown,
    parse_scalar,
    read_markdown,
)


def test_parse_markdown_metadata_and_content():

    content = """---
    id: test
    name: Test
    description: Test description
    ---

    # Test

    Markdown body.
    """

    metadata, body = parse_markdown(
        content
    )

    assert metadata["id"] == "test"
    assert metadata["name"] == "Test"
    assert (
        metadata["description"]
        == "Test description"
    )

    assert "# Test" in body
    assert "Markdown body." in body


def test_parse_markdown_supports_list():

    content = """---
    id: test
    roles:
    - tester
    - shared
    ---

    # Test
    """

    metadata, _ = parse_markdown(
        content
    )

    assert metadata["roles"] == [
        "tester",
        "shared",
    ]


def test_parse_markdown_supports_quoted_values():

    content = """---
    id: test
    name: "Test Name"
    description: 'Test description'
    ---

    # Test
    """

    metadata, _ = parse_markdown(
        content
    )

    assert (
        metadata["name"]
        == "Test Name"
    )

    assert (
        metadata["description"]
        == "Test description"
    )


def test_parse_markdown_supports_boolean_values():

    content = """---
    id: test
    enabled: true
    disabled: false
    ---

    # Test
    """

    metadata, _ = parse_markdown(
        content
    )

    assert metadata["enabled"] is True
    assert metadata["disabled"] is False


def test_parse_markdown_supports_null_values():

    content = """---
    id: test
    value1: null
    value2: none
    ---

    # Test
    """

    metadata, _ = parse_markdown(
        content
    )

    assert metadata["value1"] is None
    assert metadata["value2"] is None


def test_parse_scalar_keeps_plain_string():

    assert (
        parse_scalar("qwen3:8b")
        == "qwen3:8b"
    )


def test_parse_markdown_requires_metadata_delimiter():

    with pytest.raises(
        ValueError,
        match=(
            "must start with "
            "metadata delimiter"
        ),
    ):
        parse_markdown(
            "# Test"
        )


def test_parse_markdown_requires_closing_metadata_delimiter():

    with pytest.raises(
        ValueError,
        match=(
            "has no closing "
            "metadata delimiter"
        ),
    ):
        parse_markdown(
            """---
            id: test

            # Test
            """
        )


def test_parse_markdown_rejects_list_without_key():

    with pytest.raises(
        ValueError,
        match=(
            "List item has no "
            "metadata key"
        ),
    ):
        parse_markdown(
            """---
            - tester
            ---

            # Test
            """
        )


def test_read_markdown_from_file(
    tmp_path: Path,
):

    path = tmp_path / "test.md"

    path.write_text(
        """---
        id: test
        name: Test
        ---

        # Test
        """,
        encoding="utf-8",
    )

    metadata, body = read_markdown(
        path
    )

    assert metadata["id"] == "test"
    assert metadata["name"] == "Test"
    assert "# Test" in body


def test_read_markdown_file_not_found(
    tmp_path: Path,
):

    path = (
        tmp_path
        / "not_exist.md"
    )

    with pytest.raises(
        FileNotFoundError,
        match="Markdown file not found",
    ):
        read_markdown(
            path
        )