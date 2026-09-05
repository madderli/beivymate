from pathlib import Path
from typing import Any


def read_markdown(
    path: Path,
) -> tuple[dict[str, Any], str]:

    if not path.exists():
        raise FileNotFoundError(
            f"Markdown file not found: {path}"
        )

    if not path.is_file():
        raise ValueError(
            f"Markdown path is not a file: {path}"
        )

    content = path.read_text(
        encoding = "utf-8"
    )

    return parse_markdown(
        content,
        source = path,
    )


def parse_markdown(
    content: str,
    source: Path | None = None,
) -> tuple[dict[str, Any], str]:

    lines = content.splitlines()

    source_text = (
        str(source)
        if source is not None
        else "<memory>"
    )

    if (
        not lines
        or lines[0].strip() != "---"
    ):
        raise ValueError(
            "Markdown file must start with "
            f"metadata delimiter: {source_text}"
        )

    closing_index: int | None = None

    for index in range(
        1,
        len(lines),
    ):
        if lines[index].strip() == "---":
            closing_index = index
            break

    if closing_index is None:
        raise ValueError(
            "Markdown file has no closing "
            f"metadata delimiter: {source_text}"
        )

    metadata = parse_metadata(
        lines[1:closing_index],
        source=source,
    )

    markdown_content = "\n".join(
        lines[
            closing_index + 1:
        ]
    ).strip()

    return (
        metadata,
        markdown_content,
    )


def parse_metadata(
    lines: list[str],
    source: Path | None = None,
) -> dict[str, Any]:

    metadata: dict[str, Any] = {}

    current_list_key: str | None = None

    source_text = (
        str(source)
        if source is not None
        else "<memory>"
    )

    for line_number, raw_line in enumerate(
        lines,
        start=2,
    ):
        stripped = raw_line.strip()

        if not stripped:
            continue

        if stripped.startswith("- "):

            if current_list_key is None:
                raise ValueError(
                    "List item has no metadata key "
                    f"at line {line_number}: "
                    f"{source_text}"
                )

            item = stripped[2:].strip()

            if not item:
                raise ValueError(
                    "Metadata list item cannot "
                    f"be empty at line "
                    f"{line_number}: "
                    f"{source_text}"
                )

            current_value = metadata.get(
                current_list_key
            )

            if not isinstance(
                current_value,
                list,
            ):
                raise ValueError(
                    "Invalid metadata list "
                    f"at line {line_number}: "
                    f"{source_text}"
                )

            current_value.append(
                parse_scalar(item)
            )

            continue

        if ":" not in stripped:
            raise ValueError(
                "Invalid metadata "
                f"at line {line_number}: "
                f"{source_text}"
            )

        key, value = stripped.split(
            ":",
            1,
        )

        key = key.strip()
        value = value.strip()

        if not key:
            raise ValueError(
                "Metadata key cannot be empty "
                f"at line {line_number}: "
                f"{source_text}"
            )

        if not value:
            metadata[key] = []
            current_list_key = key
            continue

        metadata[key] = parse_scalar(
            value
        )

        current_list_key = None

    return metadata


def parse_scalar(
    value: str,
) -> Any:

    value = value.strip()

    if not value:
        return ""

    if (
        len(value) >= 2
        and value[0] == '"'
        and value[-1] == '"'
    ):
        return value[1:-1]

    if (
        len(value) >= 2
        and value[0] == "'"
        and value[-1] == "'"
    ):
        return value[1:-1]

    if value.lower() == "true":
        return True

    if value.lower() == "false":
        return False

    if value.lower() in {
        "null",
        "none",
    }:
        return None

    return value