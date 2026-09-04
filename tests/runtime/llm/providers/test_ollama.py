import pytest

from beivymate.runtime.llm.models import (
    ChatMessage,
    LLMConnectionConfig,
    LLMRequest,
)
from beivymate.runtime.llm.providers.ollama import (
    OllamaProvider,
)

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
    assert response.content == "测试成功"