from typing import Any

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

    # Clear all data from the context.
    def clear(self) -> None:
        self._data.clear()



