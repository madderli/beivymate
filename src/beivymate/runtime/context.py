from typing import Any

from beivymate.knowledge.models import KnowledgeDocument


# Stores the shared state of a single agent execution.
class AgentContext:
    def __init__(self) -> None:
        self._data: dict[str, Any] = {}

    # Store a value in the context with a given key.
    def set(self, key: str, value: Any) -> None:
        self._data[key] = value

    # Retrieve a value from the context by key, returning a default if the key is not found.
    def get(self, key: str, default: Any = None) -> Any:
        return self._data.get(key, default)

    # Check if a key exists in the context.
    def has(self, key: str) -> bool:
        return key in self._data

    # Store knowledge documents for the current agent execution.
    def set_knowledge(self, knowledge: list[KnowledgeDocument]) -> None:
        self._data["knowledge"] = knowledge

    # Retrieve knowledge documents for the current agent execution.
    def get_knowledge(self) -> list[KnowledgeDocument]:
        return self._data.get("knowledge", [])

    def set_role(self, role: str) -> None:
        self._data["role"] = role

    def get_role(self) -> str | None:
        return self._data.get("role")

    def set_locale(self, locale: str) -> None:
        self._data["locale"] = locale

    def get_locale(self) -> str | None:
        return self._data.get("locale")

    def set_scope(self, scope: str) -> None:
        self._data["scope"] = scope

    def get_scope(self) -> str:
        return self._data.get("scope", "global")

    # Clear all data from the context.
    def clear(self) -> None:
        self._data.clear()