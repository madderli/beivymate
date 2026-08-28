from beivymate.runtime.llm.gateway import LLMGateway
from beivymate.runtime.llm.models import (
    ChatMessage,
    LLMConnectionConfig,
    LLMRequest,
    LLMResponse,
)
from beivymate.runtime.llm.providers.ollama import OllamaProvider


class FakeProvider:
    def chat(self, request: LLMRequest) -> LLMResponse:
        return LLMResponse(
            model = request.model,
            content = "fake response",
        )


def test_gateway_chat():
    gateway = LLMGateway(
        provider = FakeProvider()
    )

    request = LLMRequest(
        model = "test-model",
        messages = [
            ChatMessage(
                role = "user",
                content = "hello",
            )
        ],
    )

    response = gateway.chat(request)

    assert response.model == "test-model"
    assert response.content == "fake response"


def test_gateway_with_ollama():
    config = LLMConnectionConfig(
        base_url = "http://localhost:11434",
        proxy = None,
    )

    provider = OllamaProvider(
        config = config,
    )

    gateway = LLMGateway(
        provider = provider
    )

    request = LLMRequest(
        model = "qwen3:8b",
        messages = [
            ChatMessage(
                role = "user",
                content = "请只回答：Gateway测试成功",
            )
        ],
    )

    response = gateway.chat(request)

    assert response.model == "qwen3:8b"
    assert response.content