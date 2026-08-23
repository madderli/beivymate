from beivymate.runtime.llm.models import (
    ChatMessage,
    LLMRequest,
    LLMResponse,
)


def test_chat_message():
    message = ChatMessage(
        role="user",
        content="Hello",
    )

    assert message.role == "user"
    assert message.content == "Hello"


def test_llm_request():
    request = LLMRequest(
        model="qwen3:8b",
        messages=[
            ChatMessage(
                role="user",
                content="Hello",
            )
        ],
    )

    assert request.model == "qwen3:8b"
    assert len(request.messages) == 1
    assert request.temperature == 0.0


def test_llm_response():
    response = LLMResponse(
        model="qwen3:8b",
        content="Hello!",
    )

    assert response.model == "qwen3:8b"
    assert response.content == "Hello!"