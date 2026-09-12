from pydantic import BaseModel, Field


class LLMUsage(BaseModel):
    input_tokens: int | None = Field(default=None, ge=0)
    output_tokens: int | None = Field(default=None, ge=0)

# A message exchanged with an LLM.
class ChatMessage(BaseModel):
    role: str = Field(min_length = 1)
    content: str

# A provider-independent LLM request.
class LLMRequest(BaseModel):
    model: str = Field(min_length = 1)
    messages: list[ChatMessage] = Field(min_length = 1)
    temperature: float = 0.0
    response_schema: dict | None = None
    max_output_tokens: int | None = Field(default=None, gt=0)

# A provider-independent LLM response.
class LLMResponse(BaseModel):
    model: str = Field(min_length = 1)
    content: str
    usage: LLMUsage | None = None

class LLMConnectionConfig(BaseModel):
    base_url: str = Field(min_length=1)
    api_key: str | None = Field(default=None, repr=False, exclude=True)
    proxy: str | None = None
    timeout: float = Field(default=60.0, gt=0)
