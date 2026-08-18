from beivymate.model.relation.requirement_feature import RequirementFeatureRelation

def test_requirement_can_relate_to_multiple_features():
    requirement_feature_relation_1 = RequirementFeatureRelation(
        requirement_id = "REQ-001",
        feature_id = "FEAT-001",
    )

    requirement_feature_relation_2 = RequirementFeatureRelation(
        requirement_id="REQ-001",
        feature_id="FEAT-002",
    )

    assert requirement_feature_relation_1.requirement_id == "REQ-001"
    assert requirement_feature_relation_1.feature_id == "FEAT-001"
    assert requirement_feature_relation_2.requirement_id == "REQ-001"
    assert requirement_feature_relation_2.feature_id == "FEAT-002"
