from pydantic import BaseModel, Field

# Here we define the source/original product requirement by the user.
class Requirement(BaseModel):
    id: str = Field(min_length = 1)
    title: str = Field(min_length = 1)
    content: str = Field(min_length = 1)
    