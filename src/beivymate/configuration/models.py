from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class WorkflowStepDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1)
    skill: str = Field(min_length=1)
    inputs: list[str] = Field(default_factory=list)
    analysis_strategy: Literal["simple", "standard", "deep"] = "standard"
    review_mode: Literal["manual", "auto"] = "manual"
    authorization_mode: Literal["manual", "auto"] = "manual"

    @model_validator(mode="after")
    def validate_inputs(self):
        if any(not item.strip() for item in self.inputs):
            raise ValueError("step input references cannot be empty")
        return self


# Definition of an LLM model available to BeivyMate.
class ModelDefinition(BaseModel):
    id: str = Field(min_length = 1)
    name: str = Field(min_length = 1)
    api_key_env: str | None = None
    max_retries: int = Field(default=2, ge=0, le=3)
    provider: str = Field(min_length = 1)
    model: str = Field(min_length = 1)
    base_url: str | None = None
    timeout: float = Field(
        default = 60.0,
        gt = 0,
    )
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
    step_definitions: list[WorkflowStepDefinition] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_step_definitions(self):
        if self.step_definitions:
            if len(self.steps) != len(self.step_definitions):
                raise ValueError("steps and step_definitions must have the same length")
            ids = [step.id for step in self.step_definitions]
            if len(ids) != len(set(ids)):
                raise ValueError("workflow step IDs must be unique")
        return self

    def resolved_steps(self) -> list[WorkflowStepDefinition]:
        if self.step_definitions:
            return self.step_definitions
        return [WorkflowStepDefinition(id=f"step_{index + 1}", skill=skill)
                for index, skill in enumerate(self.steps)]


# Defines a user-maintained Agent template.
class TemplateDefinition(BaseModel):
    id: str = Field(min_length = 1)
    name: str = Field(min_length = 1)
    description: str = ""
    role: str = Field(min_length = 1)
    version: str = Field(min_length = 1)
    content: str = ""
