from pathlib import Path

import pytest

from beivymate.agent.tester.skills.tester_requirement_understanding import TesterRequirementUnderstandingSkill as UnderstandingSkill
from beivymate.configuration.loader import load_template_definition
from beivymate.model.entity.requirement import Requirement
from beivymate.model.artifact.requirement_understanding import UnderstandingData


ROOT = Path(__file__).resolve().parents[3] / "resources/template/tester/tester_requirement_understanding"


@pytest.mark.parametrize("locale", ["zh-CN", "en-US"])
@pytest.mark.parametrize("strategy", ["simple", "standard", "deep"])
def test_strategy_and_language_preserve_contract(locale, strategy):
    template = load_template_definition(ROOT / locale / "DefaultTesterRequirementUnderstandingTemplate.md")
    skill = UnderstandingSkill(None, "fake", template)
    requirement = Requirement(id="R", title="Payment", content="Accept payment")
    prompt = skill._build_prompt(requirement, requirement.model_dump(), [], strategy, locale)
    assert template.version == "2.0"
    assert f"Delivery language: {locale}" in prompt
    assert skill.STRATEGIES[strategy] in prompt
    assert all(text not in prompt for name, text in skill.STRATEGIES.items() if name != strategy)
    assert "even if the template requests them" in prompt
    assert all(name in prompt for name in UnderstandingData.model_fields)


def test_invalid_strategy_fails_without_model_call():
    template = load_template_definition(ROOT / "zh-CN/DefaultTesterRequirementUnderstandingTemplate.md")
    skill = UnderstandingSkill(None, "fake", template)
    requirement = Requirement(id="R", title="T", content="C")
    with pytest.raises(ValueError, match="Unknown analysis strategy"):
        skill._build_prompt(requirement, requirement.model_dump(), [], "typo")


def test_rendering_changes_labels_not_contract():
    data = UnderstandingData.model_validate({
        **{name: {"status": "not_provided", "reason": "Missing"}
           for name in UnderstandingData.model_fields if name != "unknowns"},
        "unknowns": [{"question": "Rule?", "impact": "Cannot verify", "blocking": True,
                      "source_refs": ["requirement:R"]}],
    })
    before = data.model_dump()
    assert "业务目标与范围" in data.render_markdown("zh-CN")
    assert "阻塞：是" in data.render_markdown("zh-CN")
    assert "objective_scope" in data.render_markdown("en-US")
    assert data.model_dump() == before
