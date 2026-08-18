from pydantic import BaseModel, Field

class RequirementProductRelation(BaseModel):
    requirement_id: str = Field(min_length = 1)
    product_id: str = Field(min_length = 1)