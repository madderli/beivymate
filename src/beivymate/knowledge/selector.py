from pydantic import BaseModel, Field

from beivymate.knowledge.models import KnowledgeDocument


class KnowledgeQuery(BaseModel):
    role: str = Field(min_length = 1)
    locale: str = Field(min_length = 1)

    # Example:
    # global
    # product:his
    # customer:hospital_a
    scope: str = Field(default = "global", min_length = 1)

    category: str | None = None

    nature: str | None = None


class KnowledgeSelector:
    """Select knowledge available for a given execution context."""

    def select(
        self,
        documents: list[KnowledgeDocument],
        query: KnowledgeQuery,
    ) -> list[KnowledgeDocument]:
        selected: list[KnowledgeDocument] = []

        for document in documents:
            if not self._matches_locale(document, query):
                continue

            if not self._matches_role(document, query):
                continue

            if not self._matches_scope(document, query):
                continue

            if query.category is not None:
                if document.category != query.category:
                    continue

            if query.nature is not None:
                if document.nature != query.nature:
                    continue

            selected.append(document)

        return selected

    @staticmethod
    def _matches_locale(
        document: KnowledgeDocument,
        query: KnowledgeQuery,
    ) -> bool:
        return document.locale == query.locale

    @staticmethod
    def _matches_role(
        document: KnowledgeDocument,
        query: KnowledgeQuery,
    ) -> bool:
        if "shared" in document.roles:
            return True

        return query.role in document.roles

    @staticmethod
    def _matches_scope(
        document: KnowledgeDocument,
        query: KnowledgeQuery,
    ) -> bool:
        if document.scope == "global":
            return True

        return document.scope == query.scope