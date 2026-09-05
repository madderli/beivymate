from pathlib import Path

from pypdf import PdfReader

from beivymate.knowledge.loaders.base import (
    KnowledgeLoader,
)
from beivymate.knowledge.models import (
    KnowledgeDocument,
)
from beivymate.markdown.metadata import (
    read_markdown,
)


class PdfKnowledgeLoader(
    KnowledgeLoader
):

    def supports(
        self,
        path: Path,
    ) -> bool:

        return (
            path.suffix.lower()
            == ".pdf"
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
                f"Unsupported PDF knowledge file: {path}"
            )

        metadata_path = (
            self._metadata_path(path)
        )

        if not metadata_path.exists():
            raise FileNotFoundError(
                "PDF knowledge metadata file "
                f"not found: {metadata_path}"
            )

        metadata, _ = read_markdown(
            metadata_path
        )

        content = self._extract_text(
            path
        )

        if not content.strip():
            raise ValueError(
                "PDF knowledge contains no "
                f"extractable text: {path}"
            )

        metadata["source"] = str(path)
        metadata["source_type"] = "pdf"

        document = KnowledgeDocument(
            **metadata,
            content = content,
        )

        return [
            document
        ]

    def _metadata_path(
        self,
        path: Path,
    ) -> Path:

        return path.with_name(
            f"{path.stem}.meta.md"
        )

    def _extract_text(
        self,
        path: Path,
    ) -> str:

        reader = PdfReader(
            str(path)
        )

        pages: list[str] = []

        for page in reader.pages:

            page_text = (
                page.extract_text()
                or ""
            ).strip()

            if page_text:
                pages.append(
                    page_text
                )

        return "\n\n".join(
            pages
        )