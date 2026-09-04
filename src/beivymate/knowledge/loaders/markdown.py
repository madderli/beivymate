from pathlib import Path

from beivymate.knowledge.loaders.base import (
    KnowledgeLoader,
)
from beivymate.knowledge.models import (
    KnowledgeDocument,
)
from beivymate.markdown.metadata import (
    read_markdown,
)


class MarkdownKnowledgeLoader(
    KnowledgeLoader
):

    def supports(
        self,
        path: Path,
    ) -> bool:

        return (
            path.suffix.lower() == ".md"
            and not path.name.endswith(
                ".meta.md"
            )
        )

    def load(
        self,
        path: Path,
    ) -> list[KnowledgeDocument]:

        if not path.exists():
            raise FileNotFoundError(
                f"Knowledge file not found: {path}"
            )

        if not self.supports(path):
            raise ValueError(
                f"Unsupported Markdown knowledge file: {path}"
            )

        metadata, content = read_markdown(
            path
        )

        metadata["source"] = str(path)
        metadata["source_type"] = "markdown"

        document = KnowledgeDocument(
            **metadata,
            content=content,
        )

        return [
            document
        ]