from ..models import (
    LLMConnectionConfig,
    LLMRequest,
    LLMResponse,
)
from ..transport import HTTPTransport

# Provider for the Ollama model platform.
class OllamaProvider:

    def __init__(
        self,
        config: LLMConnectionConfig,
    ):
        self.base_url = config.base_url.rstrip("/")
        self.transport = HTTPTransport(config)

    def chat(
        self,
        request: LLMRequest,
    ) -> LLMResponse:

        url = f"{self.base_url}/api/chat"

        payload = {
            "model": request.model,
            "messages": [
                {
                    "role": message.role,
                    "content": message.content,
                }
                for message in request.messages
            ],
            "stream": False,
            "options": {
                "temperature": request.temperature,
            },
        }

        result = self.transport.post_json(
            url=url,
            payload=payload,
        )

        return LLMResponse(
            model=result["model"],
            content=result["message"]["content"],
        )