import beivymate.model.relation.feature_test_case as feature_test_case_relation

def test_feature_test_case_relation():
    relation = feature_test_case_relation.FeatureTestCaseRelation(
        feature_id = "FEAT-001",
        test_case_id = "TEST-001",
    )

    assert relation.feature_id == "FEAT-001"
    assert relation.test_case_id == "TEST-001"