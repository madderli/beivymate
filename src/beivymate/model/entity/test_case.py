from pydantic import BaseModel, Field

# Here we define reusable test asset belonging to a product function.
class TestCase(BaseModel):
    id: str = Field(min_length=1)
    title: str = Field(min_length = 1)
    description: str = Field(min_length = 1)
    
    preconditions: str = Field(min_length = 1)
    steps: list[str] = Field(default_factory = list)

    expected_results: list[str] = Field(default_factory = list)