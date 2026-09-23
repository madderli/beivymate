"""Archive accepted case snapshots by their own product/project/function lineage.

CaseStore remains the source of case identity, numbering and lifecycle. These are
read-only snapshots of accepted designs, not edits to the executable case library.
"""
from uuid import NAMESPACE_URL, uuid5
from beivymate.documents.models import DocumentOrigin, DocumentRef, OutputPolicy
from beivymate.documents.runtime import owner_for, store_for


def archive_cases(artifact, catalog, context):
    store = store_for(context)
    if store is None:
        return
    owner = owner_for(context)
    actor = context.get('document_confirmation_actor', 'runtime:acceptance-policy')
    nodes = {node.id: node for node in catalog.functions}
    inputs = [DocumentRef.model_validate(value) for value in
              context.get('document_outputs', {}).get(artifact.step_id, {}).values()]
    root = context.get('document_output_roots', {}).get(artifact.step_id)
    refs = []
    for case in artifact.case_revisions:
        catalog.check_function(case.product_id, case.function_id)
        if not case.function_id:
            raise ValueError('归档前必须确认用例所属功能')
        lineage = []
        node = case.function_id
        while node:
            lineage.insert(0, node)
            node = nodes[node].parent_id
        origin = DocumentOrigin(
            workspace=context.get('workspace_id') or 'standalone',
            task=context.get('task_id') or context.get('run_id'), run=context.get('run_id'),
            step=artifact.step_id, skill=context.get('skill_definition', {}).get('definition', {}).get('id', 'test_design'),
            product=case.product_id, project=case.project_id, function=case.function_id,
            function_path=lineage, source_asset_id=case.id, source_asset_revision=case.revision,
            responsible=case.maintainer, executor='agent:tester:test_design')
        policy = OutputPolicy(id='accepted_test_case',filename=case.number+'.json',
                              scope='project' if case.project_id else 'product',
                              asset=True,editable=False,knowledge='none')
        identity = uuid5(NAMESPACE_URL,f'{owner}:{origin.run}:{origin.step}:case:{case.id}:{case.revision}').hex
        ref = store.create(owner,policy,origin,case.model_copy(update={'review_status':'accepted'}).model_dump_json(indent=2).encode(),
                           identity=identity,inputs=inputs,task_root=root)
        store.confirm(owner,ref,actor)
        refs.append(ref.model_dump())
    recorded = dict(context.get('case_asset_refs', {}))
    recorded[artifact.step_id] = refs
    context.set('case_asset_refs', recorded)
