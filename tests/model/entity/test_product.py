import pytest
from pydantic import ValidationError

from beivymate.model.entity import Product

def test_product_creation():
    product_data = {
        "id": "PROD-001",
        "name": "Test Product Model",
        "description": "This is a test for product."
    }
    product = Product(**product_data)
    
    assert product.id == "PROD-001"
    assert product.name == "Test Product Model"
    assert product.description == "This is a test for product."

def test_product_requires_name():
    with pytest.raises(ValidationError):
        Product(
            id="PROD-002", 
            name="", 
        )

      