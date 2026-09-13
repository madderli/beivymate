from pathlib import Path

from beivymate.agent.tester.agent import TesterAgent
from beivymate.agent.tester.skills.test_analysis import TestAnalysisSkill
from beivymate.agent.tester.skills.tester_requirement_understanding import (
    TesterRequirementUnderstandingSkill,
)
from beivymate.application.agent_factory import AgentFactory
from beivymate.configuration.loader import load_template_definition, load_workflow_definition
from beivymate.configuration.template_resolver import (
    TemplateResolver,
)
from beivymate.knowledge.service import KnowledgeService
from beivymate.runtime.llm.gateway import LLMGateway
from beivymate.runtime.runtime import Runtime
from beivymate.runtime.skill_registry import SkillRegistry


PROJECT_ROOT = Path(__file__).resolve().parents[3]

TEMPLATE_ROOT = (
    PROJECT_ROOT
    / "resources"
    / "template"
)

KNOWLEDGE_ROOT = (
    PROJECT_ROOT
    / "resources"
    / "knowledge"
)


def create_tester_agent(
    workflow_path: str,
    gateway: LLMGateway,
    model: str,
    template_path: str | None = None,
    locale: str = "zh-CN",
    analysis_template_path: str | None = None,
    design_store=None,
    design_template_path: str | None = None,
    case_excel_template_path: str | None = None,
    case_column_mapping: dict | None = None,
    execution_service=None,
) -> TesterAgent:

    if template_path is None:

        resolver = TemplateResolver(
            template_root = TEMPLATE_ROOT,
        )

        template_path = str(
            resolver.resolve_default(
                role = "tester",
                template_name = (
                    "tester_requirement_understanding"
                ),
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

    definition = load_workflow_definition(Path(workflow_path))
    if any(step.skill == "test_analysis" for step in definition.resolved_steps()):
        analysis_path = Path(analysis_template_path) if analysis_template_path else TemplateResolver(TEMPLATE_ROOT).resolve_default(
            "tester", "test_analysis", locale)
        skill_registry.register("test_analysis", TestAnalysisSkill(gateway, model, load_template_definition(analysis_path)))

    knowledge_service = KnowledgeService(
        root = KNOWLEDGE_ROOT,
    )

    if any(step.skill == "test_design" for step in definition.resolved_steps()):
        from beivymate.agent.tester.skills.test_design import TestDesignSkill
        if design_store is None:
            raise ValueError("M7 workflow requires a product catalog and CaseStore")
        design_path = Path(design_template_path) if design_template_path else TemplateResolver(TEMPLATE_ROOT).resolve_default(
            "tester", "test_design", locale)
        excel_path = Path(case_excel_template_path) if case_excel_template_path else TEMPLATE_ROOT / "tester/test_design/DefaultTestCaseTemplate.xlsx"
        skill_registry.register("test_design", TestDesignSkill(gateway, model, load_template_definition(design_path),
                                design_store, excel_path, case_column_mapping))

    if any(step.skill == 'test_execution' for step in definition.resolved_steps()):
        from beivymate.agent.tester.skills.test_execution import TestExecutionSkill
        if execution_service is None:
            raise ValueError('M8 workflow requires ExecutionService')
        skill_registry.register('test_execution', TestExecutionSkill(execution_service))

    runtime = Runtime(
        skill_registry = skill_registry,
        knowledge_service = knowledge_service,
    )

    workflow = runtime.load_workflow(
        workflow_path,
    )

    return TesterAgent(
        runtime = runtime,
        workflow = workflow,
        locale = locale,
    )


def create_agent_factory(
    workflow_path: str,
    gateway: LLMGateway,
    model: str,
    template_path: str | None = None,
    locale: str = "zh-CN",
    analysis_template_path: str | None = None,
    design_store=None,
    design_template_path: str | None = None,
    case_excel_template_path: str | None = None,
    case_column_mapping: dict | None = None,
    execution_service=None,
) -> AgentFactory:

    tester_agent = create_tester_agent(
        workflow_path = workflow_path,
        template_path = template_path,
        gateway = gateway,
        model = model,
        locale = locale,
        analysis_template_path=analysis_template_path,
        design_store=design_store,
        design_template_path=design_template_path,
        case_excel_template_path=case_excel_template_path,
        case_column_mapping=case_column_mapping,
        execution_service=execution_service,
    )

    return AgentFactory(
        tester_agent = tester_agent,
    )
