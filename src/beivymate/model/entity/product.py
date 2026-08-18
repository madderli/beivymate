from pydantic import BaseModel, Field

# Here we define the source/original product by the user.
class Product(BaseModel):
    id: str = Field(min_length = 1)
    name: str = Field(min_length = 1)
    description: str = Field(default = "")