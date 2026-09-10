from pathlib import Path
from typing import TypeVar

from pydantic import BaseModel

from beivymate.configuration.models import (
    LLMSelection,
    ModelDefinition,
    TemplateDefinition,
    WorkflowDefinition,
    WorkflowStepDefinition,
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

    definition = _load_model(
        path,
        WorkflowDefinition,
    )
    if definition.step_definitions:
        return definition
    if not any(entry.endswith(".md") for entry in definition.steps):
        return definition
    resolved = []
    for index, entry in enumerate(definition.steps):
        if entry.endswith(".md"):
            step_path = Path(entry)
            if not step_path.is_absolute():
                step_path = path.parent / step_path
            try:
                resolved.append(_load_model(step_path, WorkflowStepDefinition))
            except (ValueError, OSError) as exc:
                raise ValueError(f"步骤配置 {step_path} 无效：{exc}") from exc
        else:
            resolved.append(WorkflowStepDefinition(id=f"step_{index + 1}", skill=entry))
    return WorkflowDefinition.model_validate({
        **definition.model_dump(), "step_definitions": resolved,
    })


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
