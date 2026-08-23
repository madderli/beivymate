from pydantic import BaseModel, Field

# DDefinition of an LLM model available to BeivyMate.
class ModelDefinition(BaseModel):
    id: str = Field(min_length = 1)
    name: str = Field(min_length = 1)
    provider: str = Field(min_length =1 )
    model: str = Field(min_length = 1)
    base_url: str | None = None
    enabled: bool = True

# Defines which model an agent should use.
class LLMSelection(BaseModel):
    agent: str = Field(min_length = 1)
    model: str = Field(min_length = 1)