import beivymate.model.relation.feature_test_case as feature_test_case_relation

def test_feature_can_relate_to_multiple_test_cases():
    feature_test_case_relation_1 = feature_test_case_relation.FeatureTestCaseRelation(
        feature_id = "FEAT-001",
        test_case_id = "TEST-001",
    )

    feature_test_case_relation_2 = feature_test_case_relation.FeatureTestCaseRelation(
        feature_id="FEAT-001",
        test_case_id="TEST-002",
    )

    assert feature_test_case_relation_1.feature_id == "FEAT-001"
    assert feature_test_case_relation_1.test_case_id == "TEST-001"

    assert feature_test_case_relation_2.feature_id == "FEAT-001"
    assert feature_test_case_relation_2.test_case_id == "TEST-002"