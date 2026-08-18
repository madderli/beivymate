from pydantic import BaseModel, Field

class RequirementTestCaseRelation(BaseModel):
    requirement_id: str = Field(min_length = 1)
    test_case_id: str = Field(min_length = 1)
