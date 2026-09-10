from ..models import (
    LLMConnectionConfig,
    LLMRequest,
    LLMResponse,
    LLMUsage,
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

        if request.response_schema is not None:
            payload["format"] = request.response_schema
        if request.max_output_tokens is not None:
            payload["options"]["num_predict"] = request.max_output_tokens

        result = self.transport.post_json(
            url=url,
            payload=payload,
        )

        return LLMResponse(
            model=result["model"],
            content=result["message"]["content"],
            usage=LLMUsage(input_tokens=result.get("prompt_eval_count"),
                           output_tokens=result.get("eval_count")),
        )
