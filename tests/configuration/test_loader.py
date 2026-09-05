from pathlib import Path

import pytest

from beivymate.configuration.loader import (
    load_model_definition,
)


PROJECT_ROOT = Path(__file__).resolve().parents[2]


MODEL_PATH = (
    PROJECT_ROOT
    / "resources"
    / "configuration"
    / "llm"
    / "model"
    / "qwen3-8b.md"
)


def test_load_model_definition_from_markdown():

    model = load_model_definition(
        MODEL_PATH
    )

    assert model.id

    assert model.name

    assert model.provider

    assert model.model


def test_load_model_definition_file_not_found(
    tmp_path: Path,
):

    path = (
        tmp_path
        / "not_exist.md"
    )

    with pytest.raises(
        FileNotFoundError,
        match = "Markdown file not found",
    ):
        load_model_definition(path)


def test_markdown_requires_metadata_delimiter(
    tmp_path: Path,
):

    path = tmp_path / "invalid.md"

    path.write_text(
        "invalid content",
        encoding = "utf-8",
    )

    with pytest.raises(
        ValueError,
        match = "Markdown file must start with metadata delimiter",
    ):
        load_model_definition(path)