from pathlib import Path

from beivymate.knowledge.loader import MarkdownKnowledgeLoader
from beivymate.knowledge.models import KnowledgeDocument


class KnowledgeDiscovery:
    """Discover knowledge documents from a knowledge repository."""

    def __init__(
        self,
        loader: MarkdownKnowledgeLoader | None = None,
    ) -> None:
        self._loader = loader or MarkdownKnowledgeLoader()

    def discover(self, root: Path) -> list[KnowledgeDocument]:
        if not root.exists():
            return []

        if not root.is_dir():
            raise ValueError(f"Knowledge root is not a directory: {root}")

        documents: list[KnowledgeDocument] = []

        for path in sorted(root.rglob("*.md")):
            documents.append(self._loader.load(path))

        return documents