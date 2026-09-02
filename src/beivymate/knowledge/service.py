from pathlib import Path

from beivymate.knowledge.discovery import KnowledgeDiscovery
from beivymate.knowledge.models import KnowledgeDocument, KnowledgeQuery
from beivymate.knowledge.selector import KnowledgeSelector


class KnowledgeService:
    def __init__(
        self,
        root: Path,
        discovery: KnowledgeDiscovery | None = None,
        selector: KnowledgeSelector | None = None,
    ):
        self.root = root
        self.discovery = discovery or KnowledgeDiscovery()
        self.selector = selector or KnowledgeSelector()

    def load_all(self) -> list[KnowledgeDocument]:
        return self.discovery.discover(self.root)

    def select(self, query: KnowledgeQuery) -> list[KnowledgeDocument]:
        documents = self.load_all()
        return self.selector.select(documents, query)