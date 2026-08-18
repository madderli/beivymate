from beivymate.model.entity.product_feature import ProductFeature

def test_product_feature():
    product_feature_data = {
        "id": "FEAT-001",
        "name": "Test Product Feature Model",
        "description": "This is a test for product feature."
    }
    product_feature = ProductFeature(**product_feature_data)

    assert product_feature.id == "FEAT-001"
    assert product_feature.name == "Test Product Feature Model"
    assert product_feature.description == "This is a test for product feature."