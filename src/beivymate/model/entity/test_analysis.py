from pydantic import BaseModel, Field

class TestAnalysis(BaseModel):
    id: str = Field(min_length = 1)
    scope: str = Field(min_length = 1)
    test_points: list[str] = Field(default_factory = list) 
    risks: list[str] = Field(default_factory = list)