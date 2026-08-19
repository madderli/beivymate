import pytest

from beivymate.runtime.context import AgentContext
from beivymate.runtime.skill import Skill
from beivymate.runtime.skill_registry import SkillRegistry

class TestSkill(Skill):
    def execute(self, context: AgentContext) -> None:
        context.set("executed", True)

def test_register_and_get_skill() -> None:
    registry = SkillRegistry()
    skill = TestSkill()

    registry.register(
        "test_skill",
        skill,
    )

    assert registry.get("test_skill") is skill

def test_registry_contains_skill() -> None:
    registry = SkillRegistry()
    skill = TestSkill()

    registry.register(
        "test_skill",
        skill,
    )

    assert registry.contains("test_skill")

def test_get_unknown_skill_raises_error() -> None:
    registry = SkillRegistry()

    with pytest.raises(
        KeyError,
        match="Skill not found: unknown_skill",
    ):
        registry.get("unknown_skill")

def test_duplicate_skill_registration_raises_error() -> None:
    registry = SkillRegistry()

    registry.register(
        "test_skill",
        TestSkill(),
    )

    with pytest.raises(
        ValueError,
        match="Skill already registered: test_skill",
    ):
        registry.register(
            "test_skill",
            TestSkill(),
        )