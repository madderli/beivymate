from pydantic import BaseModel, Field

# Here we define the tester-oriented understanding of a product requirement.
class TesterRequirementUnderstanding(BaseModel):
    id: str = Field(min_length = 1)
    requirement_id: str = Field(min_length=1)

    summary: str = Field(min_length = 1)

    business_objects: list[str] = Field(default_factory = list)
    business_rules: list[str] = Field(default_factory = list)
    business_flows: list[str] = Field(default_factory = list) 