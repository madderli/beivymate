from pydantic import BaseModel, Field


# Definition of an LLM model available to BeivyMate.
class ModelDefinition(BaseModel):
    id: str = Field(min_length = 1)
    name: str = Field(min_length = 1)
    provider: str = Field(min_length = 1)
    model: str = Field(min_length = 1)
    base_url: str | None = None
    enabled: bool = True


# Defines which model an agent should use.
class LLMSelection(BaseModel):
    agent: str = Field(min_length = 1)
    model: str = Field(min_length = 1)


# Defines a user-configured workflow.
class WorkflowDefinition(BaseModel):
    id: str = Field(min_length = 1)
    name: str = Field(min_length = 1)
    description: str = ""
    steps: list[str] = Field(min_length = 1)


# Defines a user-maintained Agent template.
class TemplateDefinition(BaseModel):
    id: str = Field(min_length = 1)
    name: str = Field(min_length = 1)
    description: str = ""
    role: str = Field(min_length = 1)
    version: str = Field(min_length = 1)
    content: str = ""