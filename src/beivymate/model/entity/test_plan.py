from pydantic import BaseModel, Field

# Here we define the test plan, which is selected tesstcases for a specific testing task.
class TestPlan(BaseModel):
    id: str = Field(min_length = 1)