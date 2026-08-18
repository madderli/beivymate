from pydantic import BaseModel, Field

class ProductFeatureRelation(BaseModel):
    product_id: str = Field(min_length = 1)
    feature_id: str = Field(min_length = 1)