import pytest
from beivymate.runtime.context import AgentContext
from beivymate.runtime.skill import Skill

# A simple skill used to verify the Skill contract.
class HelloSkill(Skill):
    def execute(self, context: AgentContext) -> None:
        context.set("message", "Hello from HelloSkill!")

def test_skill_execute() -> None:
    context = AgentContext()
    skill = HelloSkill()

    skill.execute(context)

    assert context.get("message") == "Hello from HelloSkill!"

def test_skill_is_abstract() -> None:
    with pytest.raises(TypeError):
        Skill()  # Attempt to instantiate the abstract class
    