from beivymate.model.relation import RequirementProductRelation

def test_requirement_can_relate_to_multiple_products():
    his_relation = RequirementProductRelation(
        requirement_id = "REQ-001",
        product_id = "PROD-HIS",
    )

    lis_relation = RequirementProductRelation(
        requirement_id="REQ-001",
        product_id="PROD-LIS",
    )

    assert his_relation.requirement_id == "REQ-001"
    assert his_relation.product_id == "PROD-HIS"

    assert lis_relation.requirement_id == "REQ-001"
    assert lis_relation.product_id == "PROD-LIS"