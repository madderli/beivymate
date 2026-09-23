"""Materialize declared Skill outputs without changing executor-specific contracts."""
from pathlib import Path
from uuid import uuid5, NAMESPACE_URL
from beivymate.documents.models import DocumentOrigin, DocumentRef
from beivymate.documents.service import DocumentStore


def store_for(context):
    root=context.get('document_store_directory')
    return DocumentStore(Path(root)) if root else None


def owner_for(context):return context.get('owner_id') or context.get('actor') or 'local-session'


def materialize(definition, context):
    store=store_for(context)
    if store is None:return
    step=context.get('step_id');run=context.get('run_id');task=context.get('task_id') or run
    origin=DocumentOrigin(workspace=context.get('workspace_id') or 'standalone',task=task,run=run,step=step,
        skill=definition.id,product=context.get('product_id'),project=context.get('project_id'),
        responsible=owner_for(context),executor='agent:'+(context.get_role() or definition.role)+':'+definition.id)
    root = resolved_output_root(definition, context)
    references={};missing=[]
    inputs=[DocumentRef.model_validate(ref) for ref in context.get('document_input_refs',[])]
    for policy in definition.output_policies:
        value=context.get(f'steps.{step}.{policy.id}')
        if value is None:
            if policy.required:missing.append(policy.id)
            continue
        if isinstance(value, dict) and set(value) == {'document_file'}:
            content = Path(value['document_file']).read_bytes()
        elif policy.filename.endswith('.json') and hasattr(value,'model_dump_json'):
            content=value.model_dump_json(indent=2).encode()
        elif isinstance(value,bytes):content=value
        elif isinstance(value,str):content=value.encode()
        elif hasattr(value,'markdown'):content=value.markdown.encode()
        elif definition.executor=='test_report':
            from beivymate.reporting.report import ReportService
            content=ReportService.render(value).encode()
        else:raise ValueError('执行器未提供声明格式的产物：'+policy.id)
        from beivymate.documents.formats import validate_content
        validate_content(policy.filename, content)
        subject = context.get(f'steps.{step}.{definition.outputs[0]}')
        rounds = getattr(subject, 'facts', {}).get('rounds', [])
        if hasattr(subject, 'round_number'):rounds = [subject.round_number]
        output_origin = origin.model_copy(update={'rounds': rounds, 'function': context.get('function_id')})
        identity=uuid5(NAMESPACE_URL,f'{run}:{step}:{policy.id}').hex
        ref=store.create(owner_for(context),policy,output_origin,content,identity=identity,inputs=inputs,
            task_root=root)
        references[policy.id]=ref.model_dump()
    all_refs=dict(context.get('document_outputs',{}));all_refs[step]=references
    context.set('document_outputs',all_refs)
    if missing:raise ValueError('必需产物尚未生成：'+', '.join(missing))


def validate_documents(context):
    store=store_for(context)
    if store is None:return
    items={item['ref']['id']:item for item in store.list(owner_for(context))}
    for value in context.get('document_outputs',{}).get(context.get('step_id'),{}).values():
        item=items[value['id']]
        if item['ref']!=value or item['file_changed']:
            raise ValueError('产物已修改，不能沿用原运行结果的确认，请重新检查输入版本')


def accept_documents(context):
    store=store_for(context)
    if store is None:return
    for value in context.get('document_outputs',{}).get(context.get('step_id'),{}).values():
        ref=DocumentRef.model_validate(value)
        # Historical approval remains tied to its version; newer drafts are not approved here.
        current=next(item for item in store.list(owner_for(context)) if item['ref']['id']==ref.id)
        if current['ref']==value and not current['confirmed_by']:
            store.confirm(owner_for(context),ref,context.get('document_confirmation_actor','runtime:acceptance-policy'))


def resolved_output_root(definition, context):
    """Resolve once per step, keeping exporter, working copies and assets together."""
    from beivymate.documents.paths import output_root
    key = {'test_design': 'design_output_directory', 'test_report': 'report_output_directory'}.get(definition.executor)
    roots = dict(context.get('document_output_roots', {}))
    step = context.get('step_id')
    if step in roots:
        return output_root(Path(roots[step]))
    explicit = context.get(key) if key else None
    binding = context.get('document_export_bindings', {}).get(key, {})
    if explicit == binding.get('generated'):
        explicit = binding.get('explicit')
    root = output_root(Path(context.get('document_store_directory')) / 'deliverables',
                       task=context.get('task_output_directory') or explicit,
                       workspace=context.get('workspace_output_directory'), user=context.get('user_output_directory'))
    roots[step] = str(root)
    context.set('document_output_roots', roots)
    return root


def prepare_output_directory(definition, context):
    """Legacy stage-specific paths are explicit customer roots, not a second store."""
    if not context.get('document_store_directory'):
        return
    key = {'test_design': 'design_output_directory', 'test_report': 'report_output_directory'}.get(definition.executor)
    root = resolved_output_root(definition, context)
    if key is None:
        return
    from beivymate.documents.service import segment
    bindings = dict(context.get('document_export_bindings', {}))
    explicit = context.get(key)
    if key in bindings and explicit == bindings[key].get('generated'):
        explicit = bindings[key].get('explicit')
    if explicit and not context.get('task_output_directory'):
        directory = root
    else:
        directory = root / 'exports' / segment(context.get('run_id')) / segment(context.get('step_id'))
    directory.mkdir(parents=True, exist_ok=True)
    context.set(key, str(directory))
    bindings[key] = {'explicit': explicit, 'generated': str(directory)}
    context.set('document_export_bindings', bindings)
