from pathlib import Path
from typing import TypeVar

from pydantic import BaseModel

from beivymate.configuration.models import (
    LLMSelection,
    ModelDefinition,
    TemplateDefinition,
    WorkflowDefinition,
)
from beivymate.markdown.metadata import (
    read_markdown,
)


T = TypeVar(
    "T",
    bound = BaseModel,
)


def _load_model(
    path: Path,
    model_type: type[T],
) -> T:

    metadata, _ = read_markdown(
        path
    )

    return model_type.model_validate(
        metadata
    )


def load_model_definition(
    path: Path,
) -> ModelDefinition:

    return _load_model(
        path,
        ModelDefinition,
    )


def load_llm_selection(
    path: Path,
) -> LLMSelection:

    return _load_model(
        path,
        LLMSelection,
    )


def load_workflow_definition(
    path: Path,
) -> WorkflowDefinition:

    return _load_model(
        path,
        WorkflowDefinition,
    )


def load_template_definition(
    path: Path,
) -> TemplateDefinition:

    metadata, content = read_markdown(
        path
    )

    metadata["content"] = content

    return TemplateDefinition.model_validate(
        metadata
    )