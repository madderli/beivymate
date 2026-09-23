from pathlib import Path
import pytest
from beivymate.configuration.library import ConfigurationLibrary
from beivymate.configuration.skill_package import SkillCatalog, load_skill
from beivymate.configuration.loader import load_workflow_definition
from beivymate.runtime.configured_skill import ConfiguredSkill
from beivymate.runtime.context import AgentContext
from beivymate.runtime.skill import Skill

ROOT = Path(__file__).resolve().parents[2] / 'resources'


def test_library_readonly_copy_conflict_and_package_templates(tmp_path):
    library = ConfigurationLibrary(ROOT, tmp_path)
    entry = library.list('skills')[0]
    with pytest.raises(PermissionError):
        library.save('skills', entry['id'], entry['content'], entry['revision'])
    content = entry['content'].replace('id: '+entry['id'], 'id: custom_analysis')
    created = library.save('skills', 'custom_analysis', content, copy_from=entry['id'])
    assert not created['builtin']
    assert (Path(created['path']).parent / 'templates').is_dir()
    Path(created['path']).write_text(content+'\n客户补充要求\n')
    with pytest.raises(FileExistsError):
        library.save('skills', created['id'], content, created['revision'])
    assert '客户补充要求' in library.list('skills')[-1]['content']
    catalog = SkillCatalog(ROOT/'skills', tmp_path/'skills')
    assert catalog.get('custom_analysis').instructions.endswith('客户补充要求')


def test_workflow_single_format_references_and_duplicates(tmp_path):
    path=tmp_path/'flow.md'
    path.write_text('---\nid: flow\nname: 测试\n---\n\n## 步骤：a\n- 技能：test_analysis\n- 分析策略：深入\n- 输入：requirement\n')
    step=load_workflow_definition(path).resolved_steps()[0]
    assert step.analysis_strategy=='deep' and step.inputs==['requirement']
    path.write_text(path.read_text()+'\n## 步骤：a\n- 技能：test_analysis\n')
    with pytest.raises(ValueError):load_workflow_definition(path)
    path.write_text('---\nid: old\nname: old\nsteps:\n  - test_analysis\n---\n')
    with pytest.raises(ValueError,match='单文件'):load_workflow_definition(path)


class Observe(Skill):
    def execute(self, context):
        context.set('observed',context.get('analysis_strategy'))


def test_supported_strategy_inheritance_and_rejection():
    catalog=SkillCatalog(ROOT/'skills')
    spec=catalog.get('test_analysis')
    skill=ConfiguredSkill(Observe(),spec,catalog.snapshot(spec.id))
    context=AgentContext();context.set('default_analysis_strategy','deep')
    skill.execute(context);assert context.get('observed')=='deep'
    context.set('analysis_strategy','simple');skill.execute(context)
    assert context.get('observed')=='simple'
    execution=catalog.get('test_execution')
    with pytest.raises(ValueError,match='不支持'):
        ConfiguredSkill(Observe(),execution,{}).execute(context)


def test_custom_skill_model_binding_and_no_fallback(tmp_path):
    from beivymate.application.composition import create_tester_agent
    from beivymate.runtime.llm.gateway import LLMGateway
    library=ConfigurationLibrary(ROOT,tmp_path)
    entry=next(e for e in library.list('skills') if e['id']=='requirement_understand')
    content=entry['content'].replace('id: requirement_understand','id: my_understanding').replace('model: null','model: special_model')
    library.save('skills','my_understanding',content,copy_from=entry['id'])
    flow=tmp_path/'flow.md';flow.write_text('---\nid: flow\nname: Flow\n---\n\n## 步骤：understand\n- 技能：my_understanding\n')
    gateway=LLMGateway(None)
    calls=[]
    def resolve(identity):
        calls.append(identity)
        return gateway,'chosen-model'
    agent=create_tester_agent(str(flow),gateway,'default',custom_skill_root=tmp_path/'skills',model_resolver=resolve)
    assert calls==['special_model']
    configured=agent._workflow.skills[0]
    assert configured.executor._model=='chosen-model'
    assert configured.snapshot['resolved_model']=='chosen-model'
    with pytest.raises(ValueError,match='模型配置不存在'):
        create_tester_agent(str(flow),gateway,'default',custom_skill_root=tmp_path/'skills')


def test_checkpoint_freezes_instructions_without_mutating_new_runs(tmp_path):
    from beivymate.runtime.runtime import Runtime
    from beivymate.runtime.skill_registry import SkillRegistry
    from beivymate.runtime.workflow import Workflow
    from beivymate.configuration.models import WorkflowDefinition, WorkflowStepDefinition
    class Recorded(Observe):
        def can_auto_authorize(self): return True
        def review_subject(self, context): return context.get('result')
        def execute(self, context): 
            context.set('result',context.get('skill_instructions'))
            context.set(f"steps.{context.get('step_id')}.test_analysis", context.get('skill_instructions'))
    catalog=SkillCatalog(ROOT/'skills')
    spec=catalog.get('test_analysis')
    old=spec.model_copy(update={'instructions':'original instructions'})
    snapshot={'definition':old.model_dump(), 'resolved_model':'fake'}
    registry=SkillRegistry()
    registry.register(old.id,ConfiguredSkill(Recorded(),old,snapshot))
    runtime=Runtime(registry)
    steps=[WorkflowStepDefinition(id=name,skill=old.id,authorization_mode='auto') for name in ('a','b')]
    flow=Workflow(WorkflowDefinition(id='f',name='F',steps=[old.id]*2,step_definitions=steps),registry.resolve([old.id]*2))
    path=tmp_path/'run.json'
    state=runtime.start(flow,AgentContext(),path)
    new=spec.model_copy(update={'instructions':'changed instructions'})
    new_registry=SkillRegistry()
    new_registry.register(new.id,ConfiguredSkill(Recorded(),new,{'definition':new.model_dump(),'resolved_model':'fake'}))
    restored=Runtime(new_registry).resume(path,decision='approved',actor='tester',expected_subject_hash=state.subject_hash)
    assert AgentContext.restore(restored.context).get('result')=='original instructions'
    assert new_registry.get(new.id).definition.instructions=='changed instructions'


@pytest.mark.parametrize('change', ['missing', 'wrong-format', 'optional', 'partial'])
def test_customer_output_contract_cannot_be_bypassed(tmp_path, change):
    library = ConfigurationLibrary(ROOT, tmp_path / 'customer')
    entry = next(e for e in library.list('skills') if e['id'] == 'test_design')
    content = entry['content'].replace('id: test_design', 'id: custom_design')
    if change == 'missing':
        content = content.split('## 产物：')[0]
    elif change == 'wrong-format':
        content = content.replace('test_design.md', 'test_design.xlsx')
    elif change == 'optional':
        content = content.replace('- 必需：是', '- 必需：否', 1)
    else:
        content = content[:content.index('## 产物：test_cases')]
    with pytest.raises(ValueError):
        library.save('skills', 'custom_design', content, copy_from='test_design')
    # Direct file edits and UI saves must apply the same validation.
    direct = tmp_path / 'manual' / 'SKILL.md'
    direct.parent.mkdir()
    direct.write_text(content)
    with pytest.raises(ValueError):
        load_skill(direct)
    assert not (tmp_path / 'customer/skills/custom_design').exists()


def test_execution_documents_are_explicit_references(tmp_path):
    library = ConfigurationLibrary(ROOT, tmp_path / 'customer')
    references = library.templates('test_execution')
    assert len(references) == 2
    assert all(item['usage'] == 'reference' and '不会改变' in item['usageDescription'] for item in references)
    assert all('参考资料' in item['text'] for item in references)
    assert all(item['usage'] == 'template' for item in library.templates('test_analysis'))
