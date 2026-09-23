import pytest
from beivymate.configuration.skill_package import SkillDefinition
from beivymate.documents.models import OutputPolicy, DocumentRef
from beivymate.documents.runtime import materialize, validate_documents, accept_documents, store_for
from beivymate.runtime.context import AgentContext


def test_multiple_outputs_required_missing_and_restart(tmp_path):
    spec=SkillDefinition(id='custom',name='Custom',description='test',role='tester',version='1',executor='custom',inputs=['requirement'],outputs=['text','prototype'],instructions='work',output_policies=[OutputPolicy(id='text',filename='custom.md'),OutputPolicy(id='prototype',filename='custom.html')])
    context=AgentContext()
    for key,value in {'document_store_directory':str(tmp_path),'owner_id':'human','run_id':'run-1','step_id':'one','task_id':'task-1','steps.one.text':'Document'}.items():context.set(key,value)
    with pytest.raises(ValueError,match='必需产物'):materialize(spec,context)
    context.set('steps.one.prototype','<html>Prototype</html>')
    materialize(spec,context)
    restored=AgentContext.restore(context.snapshot());materialize(spec,restored)
    store=store_for(restored)
    assert len(store.list('human'))==2
    assert all(i['ref']['revision']==1 for i in store.list('human'))
    validate_documents(restored)
    restored.set('document_confirmation_actor','reviewer');accept_documents(restored)
    assert all(i['confirmed_by']=='reviewer' for i in store.list('human'))
    ref=DocumentRef.model_validate(restored.get('document_outputs')['one']['text'])
    store.edit('human',ref,b'new draft',actor='human')
    with pytest.raises(ValueError,match='产物已修改'):validate_documents(restored)
    accept_documents(restored)
    assert store.list('human')[0]['confirmed_by'] is None


def test_builtin_integrity_failure_is_visible(tmp_path,monkeypatch):
    import hashlib,json
    from beivymate.configuration import integrity
    monkeypatch.setattr(integrity,'ROOT',tmp_path)
    path=tmp_path/'skills/test/SKILL.md';path.parent.mkdir(parents=True);path.write_bytes(b'release')
    (tmp_path/'builtin-manifest.json').write_text(json.dumps({'skills/test/SKILL.md':hashlib.sha256(b'release').hexdigest()}))
    integrity.verify_bundled(path)
    path.write_bytes(b'edited')
    with pytest.raises(ValueError,match='已被修改'):integrity.verify_bundled(path)


@pytest.mark.parametrize('filename,content', [('bad.xlsx',b'# text'),('bad.docx',b'# text'),('bad.json',b'not json')])
def test_materialization_rejects_mislabeled_content(tmp_path,filename,content):
    spec=SkillDefinition(id='custom',name='Custom',description='test',role='tester',version='1',executor='custom',inputs=['requirement'],outputs=['out'],instructions='work',output_policies=[OutputPolicy(id='out',filename=filename)])
    context=AgentContext()
    file=tmp_path/'source';file.write_bytes(content)
    for key,value in {'document_store_directory':str(tmp_path/'documents'),'owner_id':'human','run_id':'run','step_id':'one','steps.one.out':{'document_file':str(file)}}.items():context.set(key,value)
    with pytest.raises(ValueError,match='内容与声明格式不一致'):materialize(spec,context)
    assert store_for(context).list('human')==[]


def test_exporter_directory_respects_customer_root_and_default(tmp_path):
    from beivymate.configuration.skill_package import SkillCatalog
    from beivymate.documents.runtime import prepare_output_directory
    from pathlib import Path
    spec=SkillCatalog(Path(__file__).resolve().parents[2]/'resources/skills').get('test_report')
    context=AgentContext()
    for key,value in {'document_store_directory':str(tmp_path/'data'),'run_id':'run','step_id':'report'}.items():context.set(key,value)
    prepare_output_directory(spec,context)
    assert Path(context.get('report_output_directory')).is_relative_to(tmp_path/'data/deliverables')
    context.set('task_output_directory',str(tmp_path/'customer'))
    prepare_output_directory(spec,context)
    assert context.get('document_output_roots')['report']==str(tmp_path/'data/deliverables')
    context.set('step_id','second-report')
    prepare_output_directory(spec,context)
    assert Path(context.get('report_output_directory')).is_relative_to(tmp_path/'customer')


@pytest.mark.parametrize('executor,key',[('test_design','design_output_directory'),('test_report','report_output_directory')])
def test_export_and_managed_files_share_legacy_customer_root(tmp_path,executor,key):
    from pathlib import Path
    from beivymate.configuration.skill_package import SkillCatalog
    from beivymate.documents.runtime import prepare_output_directory,resolved_output_root
    from beivymate.documents.models import DocumentOrigin
    spec=SkillCatalog(Path(__file__).resolve().parents[2]/'resources/skills').get(executor)
    context=AgentContext()
    for name,value in {'document_store_directory':str(tmp_path/'data'),'run_id':'run','step_id':'step',key:str(tmp_path/'customer')}.items():context.set(name,value)
    prepare_output_directory(spec,context)
    root=resolved_output_root(spec,context)
    store=store_for(context)
    origin=DocumentOrigin(workspace='w',task='t',run='run',step='step',skill=executor,responsible='human',executor='agent')
    policy=OutputPolicy(id='summary',filename='summary.md',asset=True)
    ref=store.create('human',policy,origin,b'text',task_root=root)
    assert Path(store.list('human')[0]['path']).is_relative_to(tmp_path/'customer')
    store.confirm('human',ref,'human')
    assert Path(store.publish_asset('human',ref,'human')).is_relative_to(tmp_path/'customer')
    restored=AgentContext.restore(context.snapshot())
    prepare_output_directory(spec,restored)
    assert restored.get(key)==str(tmp_path/'customer')


def test_repeated_export_steps_do_not_treat_generated_path_as_customer_config(tmp_path):
    from pathlib import Path
    from beivymate.configuration.skill_package import SkillCatalog
    from beivymate.documents.runtime import prepare_output_directory
    spec=SkillCatalog(Path(__file__).resolve().parents[2]/'resources/skills').get('test_report')
    context=AgentContext()
    context.set('document_store_directory',str(tmp_path/'data'));context.set('run_id','run')
    for step in ('a','b'):
        context.set('step_id',step);prepare_output_directory(spec,context)
    assert context.get('document_output_roots')['a']==context.get('document_output_roots')['b']==str(tmp_path/'data/deliverables')
