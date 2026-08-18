from beivymate.model.relation import RequirementTestCaseRelation

def test_requirement_can_relate_to_multiple_test_cases():
    relation_1 = RequirementTestCaseRelation(
        requirement_id = "REQ-001",
        test_case_id = "TC-HIS-001",
    )

    relation_2 = RequirementTestCaseRelation(
        requirement_id = "REQ-001",
        test_case_id = "TC-LIS-001",
    )

    assert relation_1.test_case_id == "TC-HIS-001"
    assert relation_2.test_case_id == "TC-LIS-001"