from beivymate.model.entity.requirement import ProductRequirement, Requirement

def test_requirement():
    requirement_data = {
        "id": "REQ-001",
        "title": "Test Product Requirement Model",
        "content": "This is a test for product requirement."
    }
    requirement = Requirement(**requirement_data)
    
    assert requirement.id == "REQ-001"
    assert requirement.title == "Test Product Requirement Model"
    assert requirement.content == "This is the content for product requirement."