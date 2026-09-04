from beivymate.knowledge.models import KnowledgeRequirement
from beivymate.runtime.context import AgentContext
from beivymate.runtime.skill import Skill


def test_skill_has_no_knowledge_requirements_by_default():

    class SimpleSkill(Skill):

        def execute(
            self,
            context: AgentContext,
        ) -> None:
            pass

    skill = SimpleSkill()

    assert skill.knowledge_requirements() == []


def test_skill_can_declare_single_knowledge_requirement():

    class TestingSkill(Skill):

        def knowledge_requirements(
            self,
        ) -> list[KnowledgeRequirement]:
            return [
                KnowledgeRequirement(
                    category = "testing",
                    nature = "foundational",
                )
            ]

        def execute(
            self,
            context: AgentContext,
        ) -> None:
            pass

    skill = TestingSkill()

    requirements = skill.knowledge_requirements()

    assert len(requirements) == 1
    assert requirements[0].category == "testing"
    assert requirements[0].nature == "foundational"


def test_skill_can_declare_multiple_knowledge_requirements():

    class TestingSkill(Skill):

        def knowledge_requirements(
            self,
        ) -> list[KnowledgeRequirement]:
            return [
                KnowledgeRequirement(
                    category = "testing",
                    nature = "foundational",
                ),
                KnowledgeRequirement(
                    category = "product",
                    nature = "operational",
                ),
            ]

        def execute(
            self,
            context: AgentContext,
        ) -> None:
            pass

    skill = TestingSkill()

    requirements = skill.knowledge_requirements()

    assert len(requirements) == 2

    assert requirements[0].category == "testing"
    assert requirements[0].nature == "foundational"

    assert requirements[1].category == "product"
    assert requirements[1].nature == "operational"