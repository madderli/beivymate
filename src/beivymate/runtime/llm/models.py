from pydantic import BaseModel, Field

# A message exchanged with an LLM.
class ChatMessage(BaseModel):
    role: str = Field(min_length = 1)
    content: str

# The normalized response returned by an LLM provider.
class LLMResponse(BaseModel):
    content: str
    model: str