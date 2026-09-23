from beivymate.configuration.template_resolver import default_template_filename
from pathlib import Path

from beivymate.agent.tester.agent import TesterAgent
from beivymate.agent.tester.skills.test_analysis import TestAnalysisSkill
from beivymate.agent.tester.skills.requirement_understand import (
    RequirementUnderstandSkill,
)
from beivymate.application.agent_factory import AgentFactory
from beivymate.configuration.loader import load_template_definition, load_workflow_definition
from beivymate.knowledge.service import KnowledgeService
from beivymate.runtime.llm.gateway import LLMGateway
from beivymate.runtime.runtime import Runtime
from beivymate.runtime.skill_registry import SkillRegistry


PROJECT_ROOT = Path(__file__).resolve().parents[3]

TEMPLATE_ROOT = (
    PROJECT_ROOT
    / "resources"
    / "skills"
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
    custom_skill_root: Path | None = None,
    model_resolver=None,
) -> TesterAgent:

    from beivymate.configuration.skill_package import SkillCatalog
    from beivymate.runtime.configured_skill import ConfiguredSkill
    catalog = SkillCatalog(PROJECT_ROOT / 'resources/skills', custom_skill_root or Path(workflow_path).resolve().parent.parent / 'skills')
    definition = load_workflow_definition(Path(workflow_path))
    skill_registry = SkillRegistry()
    for identity in dict.fromkeys(step.skill for step in definition.resolved_steps()):
        spec = catalog.get(identity)
        if spec.role != 'tester':
            raise ValueError('Skill 不属于当前角色：' + identity)
        selected_gateway, selected_model = gateway, model
        if spec.model:
            if model_resolver is None:
                from beivymate.application.model_binding import resolve_model
                selected_gateway, selected_model = resolve_model(spec.model, PROJECT_ROOT / 'resources/configuration/llm/model',
                    (custom_skill_root or Path(workflow_path).resolve().parent.parent / 'skills').parent / 'models')
            else:
                selected_gateway, selected_model = model_resolver(spec.model)
        executor_id = spec.executor
        overrides = {'requirement_understand': template_path, 'test_analysis': analysis_template_path,
                     'test_design': design_template_path}
        if executor_id in overrides:
            path = Path(overrides[executor_id]) if overrides[executor_id] else catalog.entries[identity][1].parent / 'templates' / locale / default_template_filename(executor_id)
            template = load_template_definition(path)
            template.content += '\n\n' + spec.instructions
        if executor_id == 'requirement_understand':
            executor = RequirementUnderstandSkill(selected_gateway, selected_model, template)
        elif executor_id == 'test_analysis':
            executor = TestAnalysisSkill(selected_gateway, selected_model, template)
        elif executor_id == 'test_design':
            from beivymate.agent.tester.skills.test_design import TestDesignSkill
            if design_store is None:
                raise ValueError('Test design requires a product catalog and CaseStore')
            excel_path = Path(case_excel_template_path) if case_excel_template_path else catalog.entries[identity][1].parent / 'templates/DefaultTestCaseTemplate.xlsx'
            executor = TestDesignSkill(selected_gateway, selected_model, template, design_store, excel_path, case_column_mapping)
        elif executor_id == 'test_execution':
            from beivymate.agent.tester.skills.test_execution import TestExecutionSkill
            if execution_service is None:
                raise ValueError('Test execution requires ExecutionService')
            if spec.model:
                raise ValueError('测试执行使用已注册的执行工具，不调用模型')
            executor = TestExecutionSkill(execution_service)
        elif executor_id == 'test_report':
            from beivymate.reporting.report import ReportService
            from beivymate.agent.tester.skills.test_report import TestReportSkill
            executor = TestReportSkill(ReportService(selected_gateway, selected_model,
                catalog.entries[identity][1].parent / 'templates/zh-CN/DefaultBriefTestReportTemplate.docx'))
        else:
            raise ValueError('没有已注册的 Skill 执行器：' + executor_id)
        if executor_id == "test_report":
            executor.service.skill_instructions = spec.instructions
        snapshot = catalog.snapshot(identity)
        snapshot['resolved_model'] = selected_model
        snapshot['model_binding'] = getattr(selected_gateway, 'configuration_binding', None)
        if executor_id in overrides:
            snapshot['template'] = template.model_dump()
        import base64
        if executor_id == 'test_design':
            snapshot['binary_template'] = base64.b64encode(excel_path.read_bytes()).decode()
        if executor_id == 'test_report':
            snapshot['binary_template'] = base64.b64encode(executor.service.template.read_bytes()).decode()
        from beivymate.application.app import create_gateway
        skill_registry.register(identity, ConfiguredSkill(executor, spec, snapshot, create_gateway))
    knowledge_service = KnowledgeService(root=KNOWLEDGE_ROOT)

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
    custom_skill_root: Path | None = None,
    model_resolver=None,
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
        custom_skill_root=custom_skill_root,
        model_resolver=model_resolver,
    )

    return AgentFactory(
        tester_agent = tester_agent,
    )
