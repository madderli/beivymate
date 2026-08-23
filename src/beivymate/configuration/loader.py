from pathlib import Path
from typing import Any, TypeVar

import yaml
from pydantic import BaseModel

from beivymate.configuration.models import (
    LLMSelection,
    ModelDefinition,
)

T = TypeVar("T", bound = BaseModel)

# Load YAML front matter from a Markdown file.
def _load_front_matter(path: Path) -> dict[str, Any]:

    if not path.exists():
        raise FileNotFoundError(f"Configuration file not found: {path}")

    if not path.is_file():
        raise ValueError(f"Configuration path is not a file: {path}")

    content = path.read_text(encoding="utf-8")

    lines = content.splitlines()

    if not lines or lines[0].strip() != "---":
        raise ValueError(
            f"Configuration file must start with YAML front matter: {path}"
        )

    closing_index = None

    for index in range(1, len(lines)):
        if lines[index].strip() == "---":
            closing_index = index
            break

    if closing_index is None:
        raise ValueError(
            f"Configuration file has no closing YAML front matter: {path}"
        )

    front_matter = "\n".join(lines[1:closing_index])

    data = yaml.safe_load(front_matter)

    if data is None:
        return {}

    if not isinstance(data, dict):
        raise ValueError(
            f"YAML front matter must contain a mapping: {path}"
        )

    return data

# Load a Pydantic model from Markdown front matter.
def _load_model(path: Path, model_type: type[T]) -> T:

    data = _load_front_matter(path)

    return model_type.model_validate(data)

# Load a ModelDefinition from a Markdown configuration file.
def load_model_definition(path: Path) -> ModelDefinition:
    return _load_model(path, ModelDefinition)

# Load an LLMSelection from a Markdown configuration file.
def load_llm_selection(path: Path) -> LLMSelection:
    return _load_model(path, LLMSelection)