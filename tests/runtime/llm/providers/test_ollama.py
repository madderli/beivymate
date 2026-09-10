import pytest

from beivymate.runtime.llm.models import (
    ChatMessage,
    LLMConnectionConfig,
    LLMRequest,
)
from beivymate.runtime.llm.providers.ollama import (
    OllamaProvider,
)

@pytest.mark.llm
def test_ollama_provider_chat():

    config = LLMConnectionConfig(
        base_url = "http://localhost:11434",
        proxy = None,
    )

    provider = OllamaProvider(
        config = config,
    )

    request = LLMRequest(
        model = "qwen3:8b",
        messages = [
            ChatMessage(
                role = "user",
                content = "请只回答：测试成功",
            )
        ],
    )

    response = provider.chat(request)

    assert response.model == "qwen3:8b"
    assert response.content.strip()


def test_ollama_request_mapping_without_service(monkeypatch):
    provider = OllamaProvider(LLMConnectionConfig(base_url="http://localhost:11434/"))
    calls = []

    def post_json(url, payload):
        calls.append((url, payload))
        return {"model": "fake", "message": {"content": "result"}}

    monkeypatch.setattr(provider.transport, "post_json", post_json)
    result = provider.chat(LLMRequest(model="fake", messages=[ChatMessage(role="user", content="input")]))
    assert result.content == "result"
    assert calls[0][0] == "http://localhost:11434/api/chat"
    assert calls[0][1]["stream"] is False
    assert calls[0][1]["messages"] == [{"role": "user", "content": "input"}]
