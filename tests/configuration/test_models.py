import pytest
from pydantic import ValidationError

from beivymate.configuration.models import (
    LLMSelection,
    ModelDefinition,
)


def test_model_definition_can_be_created():
    model = ModelDefinition(
        id="qwen3-8b",
        name="Qwen3 8B",
        provider="ollama",
        model="qwen3:8b",
        base_url="http://localhost:11434",
        enabled=True,
    )

    assert model.id == "qwen3-8b"
    assert model.name == "Qwen3 8B"
    assert model.provider == "ollama"
    assert model.model == "qwen3:8b"
    assert model.base_url == "http://localhost:11434"
    assert model.enabled is True


def test_model_definition_base_url_is_optional():
    model = ModelDefinition(
        id="local-model",
        name="Local Model",
        provider="local",
        model="local-model",
    )

    assert model.base_url is None
    assert model.enabled is True


def test_model_definition_requires_id():
    with pytest.raises(ValidationError):
        ModelDefinition(
            id="",
            name="Qwen3 8B",
            provider="ollama",
            model="qwen3:8b",
        )


def test_model_definition_requires_provider():
    with pytest.raises(ValidationError):
        ModelDefinition(
            id="qwen3-8b",
            name="Qwen3 8B",
            provider="",
            model="qwen3:8b",
        )


def test_llm_selection_can_be_created():
    selection = LLMSelection(
        agent="tester",
        model="qwen3-8b",
    )

    assert selection.agent == "tester"
    assert selection.model == "qwen3-8b"


def test_llm_selection_requires_agent():
    with pytest.raises(ValidationError):
        LLMSelection(
            agent="",
            model="qwen3-8b",
        )


def test_llm_selection_requires_model():
    with pytest.raises(ValidationError):
        LLMSelection(
            agent="tester",
            model="",
        )