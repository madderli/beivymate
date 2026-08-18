from beivymate.model.entity.test_case import TestCase

def test_test_case():
    test_case_data = {
        "id": "TC001",
        "title": "Login with valid credentials",
        "description": "Test user login functionality",
        "preconditions": "User is not logged in",
        "steps": ["Enter username", "Enter password", "Click login"],
        "expected_results": ["User logged in successfully", "Dashboard displayed"]  

    }
    test_case = TestCase(**test_case_data)

    assert test_case.id == "TC001"
    assert test_case.title == "Login with valid credentials"
    assert test_case.description == "Test user login functionality"
    assert test_case.preconditions == "User is not logged in"
    assert len(test_case.steps) == 3
    assert len(test_case.expected_results) == 2