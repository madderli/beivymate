from pathlib import Path

from beivymate.agent.tester.agent import TesterAgent
from beivymate.agent.tester.skills.tester_requirement_understanding import (
    TesterRequirementUnderstandingSkill,
)
from beivymate.application.agent_factory import AgentFactory
from beivymate.configuration.loader import load_template_definition
from beivymate.configuration.template_resolver import (
    TemplateResolver,
)
from beivymate.runtime.llm.gateway import LLMGateway
from beivymate.runtime.runtime import Runtime
from beivymate.runtime.skill_registry import SkillRegistry


PROJECT_ROOT = Path(__file__).resolve().parents[3]

TEMPLATE_ROOT = (
    PROJECT_ROOT
    / "resources"
    / "template"
)


def create_tester_agent(
    workflow_path: str,
    gateway: LLMGateway,
    model: str,
    template_path: str | None = None,
    locale: str = "zh-CN",
) -> TesterAgent:

    if template_path is None:

        resolver = TemplateResolver(
            template_root=TEMPLATE_ROOT,
        )

        template_path = str(
            resolver.resolve_default(
                role = "tester",
                template_name = "tester_requirement_understanding",
                locale = locale,
            )
        )

    template = load_template_definition(
        Path(template_path)
    )

    requirement_understanding_skill = (
        TesterRequirementUnderstandingSkill(
            gateway = gateway,
            model = model,
            template = template,
        )
    )

    skill_registry = SkillRegistry()

    skill_registry.register(
        "tester_requirement_understanding",
        requirement_understanding_skill,
    )

    runtime = Runtime(
        skill_registry = skill_registry,
    )

    workflow = runtime.load_workflow(
        workflow_path,
    )

    return TesterAgent(
        runtime = runtime,
        workflow = workflow,
    )


def create_agent_factory(
    workflow_path: str,
    gateway: LLMGateway,
    model: str,
    template_path: str | None = None,
    locale: str = "zh-CN",
) -> AgentFactory:

    tester_agent = create_tester_agent(
        workflow_path = workflow_path,
        template_path = template_path,
        gateway = gateway,
        model = model,
        locale = locale,
    )

    return AgentFactory(
        tester_agent = tester_agent,
    )