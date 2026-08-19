import pytest
from beivymate.runtime.context import AgentContext
from beivymate.runtime.skill import Skill

# A simple skill used to verify the Skill contract.
def test_skill_is_abstract() -> None:
    with pytest.raises(TypeError):
        Skill()  # Attempt to instantiate the abstract class

class TestSkill(Skill):
    def execute(self, context: AgentContext) -> None:
        context.set("executed", "True")

def test_skill_execute() -> None:
    context = AgentContext()
    skill = TestSkill()

    skill.execute(context)

    assert context.get("executed") == 'True'