from typing import Any

from beivymate.knowledge.models import (
    KnowledgeDocument,
    KnowledgeRequirement,
)

# Stores the shared state of a single agent execution.
class AgentContext:
    def __init__(self) -> None:
        self._data: dict[str, Any] = {}

    def snapshot(self) -> dict:
        from beivymate.runtime.checkpoint import encode
        return encode(self._data)

    @classmethod
    def restore(cls, snapshot: dict) -> "AgentContext":
        from beivymate.runtime.checkpoint import decode
        context = cls()
        context._data = decode(snapshot)
        return context

    # Store a value in the context with a given key.
    def set(self, key: str, value: Any) -> None:
        self._data[key] = value

    # Retrieve a value from the context by key, returning a default if the key is not found.
    def get(self, key: str, default: Any = None) -> Any:
        return self._data.get(key, default)

    def step_supplement_prompt(self) -> str:
        supplement = self.get("step_supplement", "").strip()
        if not supplement:
            return ""
        return (
            "\n\n工作流步骤补充说明（仅适用于本步）：\n" + supplement
            + "\n执行时以本次任务的明确要求为先，并遵守技能的强制规则和必需资料要求。"
            "发现冲突时，在结果中明确列出待确认事项，不自行裁决。"
        )

    def step_outputs(self, step_id: str) -> dict[str, Any]:
        prefix = f'steps.{step_id}.'
        return {key: value for key, value in self._data.items() if key.startswith(prefix)}

    # Check if a key exists in the context.
    def has(self, key: str) -> bool:
        return key in self._data

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

    def set_knowledge_requirements(
        self,
        requirements: list[KnowledgeRequirement],
    ) -> None:
        self._data["knowledge_requirements"] = requirements

    def get_knowledge_requirements(
        self,
    ) -> list[KnowledgeRequirement]:
        return self._data.get("knowledge_requirements", [])

    # Store knowledge documents for the current agent execution.
    def set_knowledge(
        self,
        knowledge: list[KnowledgeDocument],
    ) -> None:
        self._data["knowledge"] = knowledge

    # Retrieve knowledge documents for the current agent execution.
    def get_knowledge(
        self,
    ) -> list[KnowledgeDocument]:
        return self._data.get("knowledge", [])

    # Clear all data from the context.
    def clear(self) -> None:
        self._data.clear()
