from beivymate.model.entity.tester_requirement_understanding import TesterRequirementUnderstanding

def test_tester_requirement_understanding():
    understanding_data = {
        "id": "UNDERSTANDING-001",
        "requirement_id": "REQ-001",
        "summary": "This is a summary of the tester's understanding of the requirement.",
        "business_objects": ["Object1", "Object2"],
        "business_rules": ["Rule1", "Rule2"],
        "business_flows": ["Flow1", "Flow2"]
    }
    understanding = TesterRequirementUnderstanding(**understanding_data)
    
    assert understanding.id == "UNDERSTANDING-001"
    assert understanding.requirement_id == "REQ-001"
    assert understanding.summary == "This is a summary of the tester's understanding of the requirement."
    assert understanding.business_objects == ["Object1", "Object2"]
    assert understanding.business_rules == ["Rule1", "Rule2"]
    assert understanding.business_flows == ["Flow1", "Flow2"]   