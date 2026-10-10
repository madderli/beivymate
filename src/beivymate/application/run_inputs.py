"""Resolve portal planning inputs once. No secrets or mutable templates in a Run."""
import base64
from pathlib import Path
from beivymate.application.app import MODEL_PATH, create_gateway
from beivymate.application.composition import create_tester_agent, KNOWLEDGE_ROOT
from beivymate.configuration.loader import load_model_definition, load_workflow_definition
from beivymate.configuration.models import TemplateDefinition
from beivymate.configuration.skill_package import SkillDefinition
from beivymate.runtime.context import AgentContext
from beivymate.runtime.checkpoint import Checkpoint
from beivymate.runtime.skill_registry import SkillRegistry
from beivymate.runtime.configured_skill import ConfiguredSkill
from beivymate.runtime.runtime import Runtime
from beivymate.knowledge.service import KnowledgeService
from beivymate.knowledge.models import KnowledgeQuery
from beivymate.model.entity.requirement import Requirement
from beivymate.documents.paths import output_root


def prepare(portal, data_dir, owner, task_id, directory, run_id):
    board = portal.board(owner)
    task = next((t for t in board['tasks'] if t['id'] == task_id), None)
    if task is None:
        raise ValueError('任务不存在')
    workspace = next(w for w in board['workspaces'] if w['id'] == task['workspace'])
    if workspace['paused'] or task['status'] == 'paused':
        raise ValueError('请先恢复工作区和任务')
    paths = list(portal.workflow_root.glob('*.md'))
    paths += list(portal.custom_workflow_root.glob('*.md'))
    path = next((p for p in paths if load_workflow_definition(p).id == task['workflow']), None)
    if path is None:
        raise ValueError('工作流已不存在')
    content = task['description']
    sources = []
    for attachment in task['attachments']:
        name, raw = portal.attachment(owner, task_id, attachment['id'])
        from beivymate.application.attachment_text import extract
        text, method = extract(name, raw)
        content += '\n\n## 附件：' + name + '\n' + text
        import hashlib
        sources.append({'id': attachment['id'], 'name': name, 'sha256': hashlib.sha256(raw).hexdigest(), 'extraction': method})
    if not content.strip():
        raise ValueError('需求正文或可解析附件不能为空')
    if len(content) > 200000:
        raise ValueError('需求与附件合计超过本阶段单次输入限制，请拆分任务，不能静默截断需求')
    from beivymate.configuration.skill_package import SkillCatalog
    from beivymate.application.composition import PROJECT_ROOT
    catalog_specs = SkillCatalog(PROJECT_ROOT / 'resources/skills', data_dir / 'configuration/skills')
    specs = [catalog_specs.get(step.skill) for step in load_workflow_definition(path).resolved_steps()]
    gateway, model_name = None, ''
    if any(spec.executor != 'test_execution' and not spec.model for spec in specs):
        model_path = data_dir / 'configuration/models/default.md'
        model = load_model_definition(model_path if model_path.exists() else MODEL_PATH)
        if not model.enabled or not model.base_url:
            raise ValueError('默认模型未启用或未配置服务地址')
        gateway = create_gateway(model.provider, model.base_url, model.timeout, model.api_key_env, model.max_retries)
        model_name = model.model
    # Explicit product catalog; never invent a customer's functional hierarchy.
    from beivymate.assets.cases import CaseStore
    from beivymate.model.artifact.test_design import ProductCatalog
    catalog_path = data_dir / 'configuration' / 'products.json'
    catalog = ProductCatalog.model_validate_json(catalog_path.read_text()) if catalog_path.exists() else None
    if any(spec.executor == 'test_design' for spec in specs) and catalog is None:
        raise ValueError('测试设计缺少产品功能目录，请配置应用数据目录下 configuration/products.json')
    case_store = CaseStore(data_dir / 'work/cases.sqlite3', catalog) if catalog else None
    from beivymate.execution.service import ExecutionService
    execution = ExecutionService(data_dir / 'work/execution' / task_id, task_id)
    agent = create_tester_agent(str(path), gateway, model_name, locale=task['locale'],
        custom_skill_root=data_dir / 'configuration/skills', design_store=case_store, execution_service=execution)
    context = AgentContext()
    context.set('requirement', Requirement(id=task['group'], title=task['title'], content=content))
    context.set_role('tester'); context.set_locale(task['locale']); context.set_scope('global')
    for key, value in {
        'owner_id': owner, 'actor': 'agent:tester', 'maintainer': owner,
        'task_id': task_id, 'workspace_id': workspace['id'], 'product_id': workspace['product'] or None,
        'project_id': workspace['project'] or None, 'default_analysis_strategy': task['analysisStrategy'],
        'document_store_directory': str(data_dir / 'work/documents'),
        'target_versions': {workspace['product']: task['version']} if workspace['product'] else {},
        'portal_snapshot': {'task': task, 'workspace': workspace, 'attachments': sources},
        'product_catalog': catalog.model_dump(mode='json') if catalog else None,
        'task_output_directory': task.get('outputDirectory') or task.get('testCasesPath') or None,
        'workspace_output_directory': workspace.get('outputDirectory') or None,
    }.items():
        context.set(key, value)
    from beivymate.markdown.metadata import read_markdown
    preferences = data_dir / 'configuration/preferences.md'
    settings = read_markdown(preferences)[0] if preferences.exists() else {}
    context.set('user_output_directory', settings.get('outputDirectory'))
    root = output_root(data_dir / 'work/documents/deliverables', task=context.get('task_output_directory'),
        workspace=context.get('workspace_output_directory'), user=context.get('user_output_directory'))
    root.mkdir(parents=True, exist_ok=True)
    import tempfile
    with tempfile.TemporaryFile(dir=root):
        pass
    context.set('task_output_directory', str(root))
    knowledge = KnowledgeService(KNOWLEDGE_ROOT).select(KnowledgeQuery(role='tester', locale=task['locale']))
    context.set_knowledge(knowledge); context.set('frozen_knowledge', knowledge)
    for step in agent._workflow.definition.resolved_steps():
        if 'review_mode' not in step.model_fields_set:
            step.review_mode = task['reviewMode']
    state = agent._runtime.start(agent._workflow, context, directory / 'checkpoint.json', execute=False, run_id=run_id)
    frozen = AgentContext.restore(state.context)
    available = set()
    for step in state.workflow.resolved_steps():
        for reference in step.inputs:
            if reference not in available and not frozen.has(reference):
                raise ValueError(f'步骤 {step.id} 缺少输入：{reference}')
        spec = agent._runtime._skill_registry.get(step.skill).definition
        available.update(f'steps.{step.id}.{name}' for name in spec.outputs)
    if any(s.executor == 'test_design' for s in [agent._runtime._skill_registry.get(step.skill).definition for step in state.workflow.resolved_steps()]):
        if not workspace['product'] or workspace['product'] not in catalog.products:
            raise ValueError('测试设计需要工作区产品标识与产品功能目录匹配')



def restore_runtime(state: Checkpoint, data_dir: Path, directory: Path):
    """Rebuild from frozen packages only, even if customer config has been edited/deleted."""
    context = AgentContext.restore(state.context)
    registry = SkillRegistry()
    for identity, snapshot in context.get('skill_packages', {}).items():
        spec = SkillDefinition.model_validate(snapshot['definition'])
        gateway = create_gateway(**snapshot['model_binding']) if snapshot.get('model_binding') else None
        model = snapshot['resolved_model']
        template = TemplateDefinition.model_validate(snapshot['template']) if 'template' in snapshot else None
        binary = directory / (identity + ('-template.xlsx' if spec.executor == 'test_design' else '-template.docx'))
        if snapshot.get('binary_template'):
            binary.write_bytes(base64.b64decode(snapshot['binary_template']))
        if spec.executor == 'requirement_understand':
            from beivymate.agent.tester.skills.requirement_understand import RequirementUnderstandSkill
            executor = RequirementUnderstandSkill(gateway, model, template)
        elif spec.executor == 'test_analysis':
            from beivymate.agent.tester.skills.test_analysis import TestAnalysisSkill
            executor = TestAnalysisSkill(gateway, model, template)
        elif spec.executor == 'test_design':
            from beivymate.agent.tester.skills.test_design import TestDesignSkill
            from beivymate.assets.cases import CaseStore
            from beivymate.model.artifact.test_design import ProductCatalog
            store = CaseStore(data_dir / 'work/cases.sqlite3', ProductCatalog.model_validate(context.get('product_catalog')))
            executor = TestDesignSkill(gateway, model, template, store, binary)
        elif spec.executor == 'test_execution':
            from beivymate.agent.tester.skills.test_execution import TestExecutionSkill
            from beivymate.execution.service import ExecutionService
            executor = TestExecutionSkill(ExecutionService(data_dir / 'work/execution' / context.get('task_id'), context.get('task_id')))
        elif spec.executor == 'test_report':
            from beivymate.agent.tester.skills.test_report import TestReportSkill
            from beivymate.reporting.report import ReportService
            executor = TestReportSkill(ReportService(gateway, model, binary))
        else:
            raise ValueError('原执行器不可用：' + spec.executor)
        configured = ConfiguredSkill(executor, spec, snapshot, create_gateway)
        configured.restore(snapshot)
        registry.register(identity, configured)
    return Runtime(registry)
