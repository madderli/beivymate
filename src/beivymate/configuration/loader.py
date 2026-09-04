from pathlib import Path
from typing import Any, TypeVar

from pydantic import BaseModel

from beivymate.configuration.models import (
    LLMSelection,
    ModelDefinition,
    TemplateDefinition,
    WorkflowDefinition,
)
from beivymate.markdown.metadata import read_markdown


T = TypeVar("T", bound = BaseModel)


# Read a BeivyMate Markdown file and return
# its metadata and Markdown body.
def _read_markdown(
    path: Path,
) -> tuple[dict[str, Any], str]:

    if not path.exists():
        raise FileNotFoundError(
            f"Configuration file not found: {path}"
        )

    if not path.is_file():
        raise ValueError(
            f"Configuration path is not a file: {path}"
        )

    content = path.read_text(
        encoding="utf-8"
    )

    lines = content.splitlines()

    if not lines or lines[0].strip() != "---":
        raise ValueError(
            f"Markdown file must start with metadata delimiter: {path}"
        )

    closing_index = None

    for index in range(1, len(lines)):

        if lines[index].strip() == "---":
            closing_index = index
            break

    if closing_index is None:
        raise ValueError(
            f"Markdown file has no closing metadata delimiter: {path}"
        )

    metadata_lines = lines[1:closing_index]

    metadata = _parse_metadata(
        metadata_lines,
        path,
    )

    markdown_content = "\n".join(
        lines[closing_index + 1:]
    ).strip()

    return metadata, markdown_content


# Parse metadata from the Markdown metadata section.
#
# Supported format:
#
# id: smoke_test
# name: Smoke Test
# description: Default smoke test workflow.
#
# steps:
#   - tester_requirement_understanding
#   - test_analysis
#
def _parse_metadata(
    lines: list[str],
    path: Path,
) -> dict[str, Any]:

    metadata: dict[str, Any] = {}

    current_list_key: str | None = None

    for line_number, line in enumerate(
        lines,
        start=2,
    ):

        stripped = line.strip()

        if not stripped:
            continue

        # List item.
        if stripped.startswith("- "):

            if current_list_key is None:
                raise ValueError(
                    f"List item has no metadata key at line "
                    f"{line_number}: {path}"
                )

            item = stripped[2:].strip()

            if not item:
                raise ValueError(
                    f"Metadata list item cannot be empty at line "
                    f"{line_number}: {path}"
                )

            current_value = metadata.get(
                current_list_key
            )

            if not isinstance(
                current_value,
                list,
            ):
                raise ValueError(
                    f"Invalid metadata list at line "
                    f"{line_number}: {path}"
                )

            current_value.append(
                _parse_scalar(item)
            )

            continue

        # A new metadata key.
        if ":" not in stripped:
            raise ValueError(
                f"Invalid metadata at line "
                f"{line_number}: {path}"
            )

        key, value = stripped.split(
            ":",
            1,
        )

        key = key.strip()
        value = value.strip()

        if not key:
            raise ValueError(
                f"Metadata key cannot be empty at line "
                f"{line_number}: {path}"
            )

        # key:
        #
        # This starts a list value.
        if not value:
            metadata[key] = []
            current_list_key = key
            continue

        metadata[key] = _parse_scalar(
            value
        )

        current_list_key = None

    return metadata


# Parse a scalar metadata value.
def _parse_scalar(
    value: str,
) -> Any:

    value = value.strip()

    if not value:
        return ""

    # Double quoted string.
    if (
        len(value) >= 2
        and value[0] == '"'
        and value[-1] == '"'
    ):
        return value[1:-1]

    # Single quoted string.
    if (
        len(value) >= 2
        and value[0] == "'"
        and value[-1] == "'"
    ):
        return value[1:-1]

    # Boolean.
    if value.lower() == "true":
        return True

    if value.lower() == "false":
        return False

    # Null.
    if value.lower() in {
        "null",
        "none",
    }:
        return None

    # Keep other values as strings.
    return value


# Load a Pydantic model from Markdown metadata.
def _load_model(
    path: Path,
    model_type: type[T],
) -> T:

    metadata, _ = _read_markdown(
        path
    )

    return model_type.model_validate(
        metadata
    )


# Load an LLM model definition.
def load_model_definition(
    path: Path,
) -> ModelDefinition:

    return _load_model(
        path,
        ModelDefinition,
    )


# Load an LLM selection definition.
def load_llm_selection(
    path: Path,
) -> LLMSelection:

    return _load_model(
        path,
        LLMSelection,
    )


# Load a workflow definition.
def load_workflow_definition(
    path: Path,
) -> WorkflowDefinition:

    return _load_model(
        path,
        WorkflowDefinition,
    )


# Load a user-maintained template.
def load_template_definition(
    path: Path,
) -> TemplateDefinition:

    metadata, content = _read_markdown(
        path
    )

    metadata["content"] = content

    return TemplateDefinition.model_validate(
        metadata
    )