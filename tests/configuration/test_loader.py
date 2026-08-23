from pathlib import Path

import pytest
from pydantic import ValidationError

from beivymate.configuration.loader import (
    load_llm_selection,
    load_model_definition,
)

PROJECT_ROOT = Path(__file__).resolve().parents[2]

def test_load_model_definition_from_markdown():
    path = (
        PROJECT_ROOT
        / "resources"
        / "configuration"
        / "llm"
        / "models"
        / "qwen3-8b.md"
    )

    model = load_model_definition(path)

    assert model.id == "qwen3-8b"
    assert model.name == "Qwen3 8B"
    assert model.provider == "ollama"
    assert model.model == "qwen3:8b"
    assert model.base_url == "http://localhost:11434"
    assert model.enabled is True


def test_load_model_definition_file_not_found(tmp_path):
    path = tmp_path / "not-exist.md"

    with pytest.raises(FileNotFoundError):
        load_model_definition(path)


def test_markdown_without_front_matter_is_rejected(tmp_path):
    path = tmp_path / "invalid.md"

    path.write_text(
        "# Qwen3 8B\n\nNo front matter.",
        encoding="utf-8",
    )

    with pytest.raises(ValueError):
        load_model_definition(path)


def test_markdown_without_closing_front_matter_is_rejected(tmp_path):
    path = tmp_path / "invalid.md"

    path.write_text(
        "---\n"
        "id: qwen3-8b\n"
        "name: Qwen3 8B\n"
        "provider: ollama\n"
        "model: qwen3:8b\n",
        encoding="utf-8",
    )

    with pytest.raises(ValueError):
        load_model_definition(path)


def test_invalid_model_definition_is_rejected(tmp_path):
    path = tmp_path / "invalid.md"

    path.write_text(
        "---\n"
        "id: qwen3-8b\n"
        "name: Qwen3 8B\n"
        "provider: ollama\n"
        "model: \n"
        "---\n"
        "# Qwen3 8B\n",
        encoding="utf-8",
    )

    with pytest.raises(ValidationError):
        load_model_definition(path)


def test_load_llm_selection_from_markdown(tmp_path):
    path = tmp_path / "selection.md"

    path.write_text(
        "---\n"
        "agent: tester\n"
        "model: qwen3-8b\n"
        "---\n"
        "\n"
        "# Tester Agent Model Selection\n",
        encoding="utf-8",
    )

    selection = load_llm_selection(path)

    assert selection.agent == "tester"
    assert selection.model == "qwen3-8b"