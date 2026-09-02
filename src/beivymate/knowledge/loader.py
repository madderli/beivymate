from pathlib import Path

from beivymate.knowledge.models import KnowledgeDocument


class MarkdownKnowledgeLoader:
    """Load KnowledgeDocument from BeivyMate Markdown files."""

    def load(self, path: Path) -> KnowledgeDocument:
        if not path.exists():
            raise FileNotFoundError(path)

        if path.suffix.lower() != ".md":
            raise ValueError(f"Unsupported knowledge file: {path}")

        text = path.read_text(encoding = "utf-8")

        metadata, content = self._parse(text)

        metadata.setdefault("source", str(path))
        metadata.setdefault("source_type", "markdown")

        return KnowledgeDocument(
            **metadata,
            content = content.strip(),
        )

    def _parse(self, text: str) -> tuple[dict[str, object], str]:
        lines = text.splitlines()

        if not lines or lines[0].strip() != "---":
            raise ValueError("Knowledge Markdown must start with '---'")

        end_index = None

        for index in range(1, len(lines)):
            if lines[index].strip() == "---":
                end_index = index
                break

        if end_index is None:
            raise ValueError(
                "Knowledge Markdown metadata block is not closed"
            )

        metadata = self._parse_metadata(lines[1:end_index])
        content = "\n".join(lines[end_index + 1 :])

        return metadata, content

    def _parse_metadata(
        self,
        lines: list[str],
    ) -> dict[str, object]:
        metadata: dict[str, object] = {}

        current_list_key: str | None = None

        for raw_line in lines:
            line = raw_line.strip()

            if not line:
                continue

            if line.startswith("- "):
                if current_list_key is None:
                    raise ValueError(
                        "List item found without a metadata key"
                    )

                values = metadata.setdefault(current_list_key, [])

                if not isinstance(values, list):
                    raise ValueError(
                        f"Metadata '{current_list_key}' is not a list"
                    )

                values.append(self._parse_scalar(line[2:].strip()))
                continue

            if ":" not in line:
                raise ValueError(
                    f"Invalid metadata line: {raw_line}"
                )

            key, value = line.split(":", 1)
            key = key.strip()
            value = value.strip()

            if not key:
                raise ValueError(
                    f"Metadata key cannot be empty: {raw_line}"
                )

            if value:
                metadata[key] = self._parse_scalar(value)
                current_list_key = None
            else:
                metadata[key] = []
                current_list_key = key

        return metadata

    @staticmethod
    def _parse_scalar(value: str) -> str:
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

        return value