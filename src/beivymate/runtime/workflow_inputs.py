"""Import accepted historical artifacts under caller-chosen input names; never infer step order."""
from pathlib import Path
from beivymate.markdown.metadata import read_markdown
from beivymate.runtime.checkpoint import Checkpoint, digest
from beivymate.runtime.context import AgentContext


def import_inputs(files, base_directory, context):
    imports=[]
    for name in files:
        path=Path(name)
        if not path.is_absolute():
            if base_directory is None: raise ValueError('Relative workflow imports require a base directory')
            path=Path(base_directory)/path
        config,_=read_markdown(path)
        key=config.get('id');source_key=config.get('source_key');checkpoint=config.get('checkpoint')
        if not all(isinstance(v,str) and v.strip() for v in (key,source_key,checkpoint)):
            raise ValueError('Workflow import requires id, checkpoint and source_key')
        if not key.startswith('inputs.') or context.has(key):
            raise ValueError('Workflow imports must use a unique inputs.* key')
        source=Path(checkpoint)
        if not source.is_absolute():source=path.parent/source
        state=Checkpoint.load(source)
        artifact=AgentContext.restore(state.context).get(source_key)
        if artifact is None or not hasattr(artifact,'id'):
            raise ValueError('Imported artifact not found')
        hash_value=digest(artifact)
        decision=next((d for d in state.decisions if d.phase=='review' and d.decision=='approved'
            and d.artifact_id==artifact.id and d.subject_hash==hash_value),None)
        if decision is None:raise ValueError('Imported artifact is not accepted or changed')
        if any(e['artifact_id']==artifact.id and e['hash']!=hash_value for e in imports):
            raise ValueError('Conflicting imported artifact revisions')
        context.set(key,artifact)
        imports.append({'key':key,'artifact_id':artifact.id,'hash':hash_value,
            'source_checkpoint':str(source.resolve()),'decision':decision.model_dump(mode='json')})
    return imports
