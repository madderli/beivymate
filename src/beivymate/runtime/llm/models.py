from pydantic import BaseModel, Field

# A message exchanged with an LLM.
class ChatMessage(BaseModel):
    role: str = Field(min_length = 1)
    content: str

# A provider-independent LLM request.
class LLMRequest(BaseModel):
    model: str = Field(min_length = 1)
    messages: list[ChatMessage] = Field(min_length = 1)
    temperature: float = 0.0

# A provider-independent LLM response.
class LLMResponse(BaseModel):
    model: str = Field(min_length = 1)
    content: str

class LLMConnectionConfig(BaseModel):
    base_url: str = Field(min_length=1)
    api_key: str | None = None
    proxy: str | None = None
    timeout: float = Field(default=60.0, gt=0)