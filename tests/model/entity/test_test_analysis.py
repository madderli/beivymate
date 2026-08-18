from beivymate.model.entity.test_analysis import TestAnalysis

def test_test_analysis():
    test_analysis_data = {
        "id": "TA001",
        "scope": "User authentication",
        "test_points": ["Test login with valid credentials", "Test login with invalid credentials"],
        "risks": ["Potential security vulnerability", "Performance issues under load"]
    }
    test_analysis = TestAnalysis(**test_analysis_data)

    assert test_analysis.id == "TA001"
    assert test_analysis.scope == "User authentication"
    assert len(test_analysis.test_points) == 2
    assert len(test_analysis.risks) == 2