from typing import Protocol

from beivymate.runtime.llm.models import (
    LLMRequest,
    LLMResponse,
)

# Interface implemented by every LLM provider.
class LLMProvider(Protocol):
    
    def chat(
        self,
        request: LLMRequest, 
    ) -> LLMResponse:
        ...