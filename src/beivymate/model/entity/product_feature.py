from pydantic import BaseModel, Field

# Here we define the source/original product feature by the user.
class ProductFeature(BaseModel):
    id: str = Field(min_length = 1)
    name: str = Field(min_length = 1)
    description: str = Field(min_length = 1)