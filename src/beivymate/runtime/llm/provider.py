from typing import Protocol

from beivymate.runtime.llm.models import (
    ChatMessage,
    LLMResponse,
)

# Interface implemented by every LLM provider.
class LLMProvider(Protocol):
    
    def chat(
        self,
        messages: list[ChatMessage],
    ) -> LLMResponse:
        ...