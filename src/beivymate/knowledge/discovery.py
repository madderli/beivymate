from pathlib import Path

from beivymate.knowledge.loaders.base import KnowledgeLoader
from beivymate.knowledge.loaders.markdown import MarkdownKnowledgeLoader
from beivymate.knowledge.loaders.pdf import PdfKnowledgeLoader

from beivymate.knowledge.models import (
    KnowledgeDocument,
)


class KnowledgeDiscovery:

    def __init__(
        self,
        loaders: list[KnowledgeLoader]
        | None = None,
    ) -> None:

        self._loaders = (
            loaders
            if loaders is not None
            else [
                MarkdownKnowledgeLoader(),
                PdfKnowledgeLoader(),
            ]
        )

    def discover(
        self,
        root: Path,
    ) -> list[KnowledgeDocument]:

        if not root.exists():
            return []

        if not root.is_dir():
            raise ValueError(
                "Knowledge root is not "
                f"a directory: {root}"
            )

        documents: list[
            KnowledgeDocument
        ] = []

        for path in sorted(
            root.rglob("*")
        ):
            if not path.is_file():
                continue

            loader = self._resolve_loader(
                path
            )

            if loader is None:
                continue

            documents.extend(
                loader.load(path)
            )

        return documents

    def _resolve_loader(
        self,
        path: Path,
    ) -> KnowledgeLoader | None:

        for loader in self._loaders:

            if loader.supports(path):
                return loader

        return None