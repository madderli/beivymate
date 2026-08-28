from beivymate.agent.tester.agent import TesterAgent
from beivymate.agent.tester.skills.tester_requirement_understanding import (
    TesterRequirementUnderstandingSkill,
)
from beivymate.application.agent_factory import AgentFactory
from beivymate.runtime.runtime import Runtime
from beivymate.runtime.skill_registry import SkillRegistry


def create_tester_agent(
    workflow_path: str,
    gateway,
    model: str,
) -> TesterAgent:

    # Create tester-specific skills.
    requirement_understanding = (
        TesterRequirementUnderstandingSkill(
            gateway=gateway,
            model=model,
        )
    )

    # Create registry.
    skill_registry = SkillRegistry()

    # Register built-in tester skills.
    skill_registry.register(
        "tester_requirement_understanding",
        requirement_understanding,
    )

    # Create runtime.
    runtime = Runtime(
        skill_registry=skill_registry,
    )

    # Load user-configured workflow.
    workflow = runtime.load_workflow(
        workflow_path,
    )

    # Assemble tester agent.
    return TesterAgent(
        runtime=runtime,
        workflow=workflow,
    )


def create_agent_factory(
    workflow_path: str,
    gateway,
    model: str,
) -> AgentFactory:

    tester_agent = create_tester_agent(
        workflow_path=workflow_path,
        gateway=gateway,
        model=model,
    )

    return AgentFactory(
        tester_agent=tester_agent,
    )