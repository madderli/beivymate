from pydantic import BaseModel, Field

class RequirementFeatureRelation(BaseModel):
    requirement_id: str = Field(min_length = 1)
    feature_id: str = Field(min_length = 1)