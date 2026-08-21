import pytest
from pydantic import ValidationError

from beivymate.runtime.llm.models import (
    ChatMessage,
    LLMResponse,
)
from beivymate.runtime.llm.provider import LLMProvider


class FakeProvider:
    def chat(
        self,
        messages: list[ChatMessage],
    ) -> LLMResponse:
        return LLMResponse(
            content="fake response",
            model="fake-model",
        )


def test_chat_message_can_be_created():
    message = ChatMessage(
        role="user",
        content="你好",
    )

    assert message.role == "user"
    assert message.content == "你好"


def test_chat_message_requires_role():
    with pytest.raises(ValidationError):
        ChatMessage(
            role="",
            content="你好",
        )


def test_llm_response_can_be_created():
    response = LLMResponse(
        content="你好，我是 Qwen。",
        model="qwen3:8b",
    )

    assert response.content == "你好，我是 Qwen。"
    assert response.model == "qwen3:8b"


def test_fake_provider_implements_provider_interface():
    provider: LLMProvider = FakeProvider()

    response = provider.chat(
        [
            ChatMessage(
                role="user",
                content="hello",
            )
        ]
    )

    assert response.content == "fake response"
    assert response.model == "fake-model"