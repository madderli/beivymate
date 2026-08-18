from beivymate.model.entity.test_plan import TestPlan

def test_test_plan():
    test_plan_data = {
        "id": "PLAN-001",
    }
    test_plan = TestPlan(**test_plan_data)
    
    assert test_plan.id == "PLAN-001"
