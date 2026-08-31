from pydantic import ValidationError
import pytest

from beivymate.model.entity.test_tester_requirement_understanding import (
    TesterRequirementUnderstanding,
)

def test_create_tester_requirement_understanding():

    understanding = TesterRequirementUnderstanding(
        functional_objective = "患者可以使用微信完成门诊缴费。",
        actors_roles = [
            "患者",
            "收费人员",
        ],
        main_business_flow = [
            "患者进入门诊缴费",
            "选择微信支付",
            "完成支付",
        ],
        business_rules = [
            "支付金额必须大于0",
        ],
        preconditions = [
            "患者存在待缴费账单",
        ],
        inputs_outputs = [
            "输入：支付金额",
            "输出：支付结果",
        ],
        state_changes = [
            "待缴费变为已缴费",
        ],
        exception_scenarios = [
            "微信支付失败",
        ],
        boundary_conditions = [
            "支付金额为0",
        ],
        dependencies = [
            "微信支付服务",
        ],
        potential_risks = [
            "支付成功但系统状态未更新",
        ],
        ambiguous_or_missing_requirements = [
            "未明确支付超时处理规则",
        ],
    )

    assert (
        understanding.functional_objective
        == "患者可以使用微信完成门诊缴费。"
    )

    assert "患者" in understanding.actors_roles

    assert (
        "微信支付"
        in understanding.main_business_flow[1]
    )

    assert (
        "支付金额必须大于0"
        in understanding.business_rules
    )

    assert (
        "微信支付服务"
        in understanding.dependencies
    )


def test_tester_requirement_understanding_default_lists():

    understanding = TesterRequirementUnderstanding(
        functional_objective =" 患者可以完成支付。"
    )

    assert understanding.actors_roles == []

    assert understanding.main_business_flow == []

    assert understanding.business_rules == []

    assert understanding.preconditions == []

    assert understanding.inputs_outputs == []

    assert understanding.state_changes == []

    assert understanding.exception_scenarios == []

    assert understanding.boundary_conditions == []

    assert understanding.dependencies == []

    assert understanding.potential_risks == []

    assert (
        understanding.ambiguous_or_missing_requirements
        == []
    )


def test_functional_objective_is_required():

    with pytest.raises(ValidationError):

        TesterRequirementUnderstanding()