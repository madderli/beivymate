from abc import ABC, abstractmethod
from pathlib import Path

from beivymate.knowledge.models import (
    KnowledgeDocument,
)


class KnowledgeLoader(ABC):

    @abstractmethod
    def supports(
        self,
        path: Path,
    ) -> bool:
        pass

    @abstractmethod
    def load(
        self,
        path: Path,
    ) -> list[KnowledgeDocument]:
        pass