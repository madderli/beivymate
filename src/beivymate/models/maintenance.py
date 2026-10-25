"""Reference-aware model maintenance. Never modifies frozen task snapshots."""
import base64
from contextlib import ExitStack
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import tempfile
import uuid
from beivymate.identity.service import IdentityError
from beivymate.markdown.metadata import read_markdown
from beivymate.scheduling.locking import exclusive_file


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def atomic_write(path, raw):
    path = Path(path)
    fd, name = tempfile.mkstemp(dir=path.parent, prefix='.model-maintenance-')
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(raw); stream.flush(); os.fsync(stream.fileno())
        os.replace(name, path)
    finally: Path(name).unlink(missing_ok=True)


class ModelMaintenance:
    def __init__(self, catalog, conversations, library):
        self.catalog, self.conversations, self.library = catalog, conversations, library
        self.portal = catalog.portal
        self.journal = catalog.root / 'work/model-maintenance-journal.json'
        with self.portal.db() as db:
            db.execute('CREATE TABLE IF NOT EXISTS model_operation(id TEXT PRIMARY KEY,owner TEXT,at TEXT,action TEXT,source TEXT,target TEXT,changes TEXT)')
        self.recover()

    def recover(self):
        if not self.journal.exists(): return
        value = json.loads(self.journal.read_text())
        with self.portal.db() as db:
            committed = db.execute('SELECT 1 FROM model_operation WHERE id=?', (value['id'],)).fetchone()
        if not committed:
            for item in value['files']:
                path = Path(item['path']).resolve()
                roots = [self.catalog.root.resolve(), self.portal.skill_center.custom.resolve()]
                if not any(path.is_relative_to(root) for root in roots): raise ValueError('恢复文件超出本机数据目录')
                before=base64.b64decode(item['before'])
                if item.get('after') and path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() not in (hashlib.sha256(before).hexdigest(),item['after']):
                    raise FileExistsError('模型维护恢复遇到外部文件变更，已保留文件，请人工核对：'+path.name)
                atomic_write(path,before)
        self.journal.unlink()

    def references(self, owner):
        doc, _ = self.catalog._read(owner)
        refs = []
        def add(identity, kind, name, model, *, inherited=False, dependency='', reason='', path=None, resource=None, revision=None, required=(), minimum=None):
            if not model: return
            refs.append(dict(id=identity, kind=kind, name=name, model=model, inherited=inherited, dependency=dependency,
                eligible=not reason, reason=reason, path=str(path) if path else None, resource=resource,
                revision=revision, required=list(required), minimum=minimum))
        for purpose, title in [('general','通用默认模型'), ('chat','默认对话模型'), ('skill','默认技能模型')]:
            explicit = getattr(doc.defaults, purpose)
            add('default:'+purpose, 'default', title, explicit or doc.defaults.general,
                inherited=not explicit and purpose!='general', dependency='default:general' if not explicit else '')
        for tier, model in doc.tiers.items(): add('tier:'+tier, 'tier', tier+'主模型', model)
        for tier, chain in doc.backups.items():
            for model in chain: add('backup:'+tier+':'+model, 'backup', tier+'备用模型', model)
        with self.conversations.db() as db:
            chats = [dict(r) for r in db.execute('SELECT context,model FROM preference WHERE owner=?', (owner,))]
        for chat in chats:
            try: self.conversations.context(owner, chat['context'])
            except IdentityError: continue
            reason = ''
            if chat['context'].startswith('task:'):
                reason = '任务对话配置保持原样，请在任务中处理'
            add('chat:'+chat['context'], 'chat', '对话 '+chat['context'], chat['model'] or doc.defaults.chat or doc.defaults.general,
                inherited=not chat['model'], dependency='default:chat', reason=reason, resource=chat['context'], revision=chat['model'])
        skill_refs = {}
        scanned=self.portal.skill_center.scan()
        if scanned['errors']:raise ValueError('技能包存在无法读取的内容，引用清单不完整，请先修复技能包')
        skill_details={}
        for item in scanned['items']:
            entry, builtin = self.portal.skill_center._entry(item['id'])
            meta, _ = read_markdown(entry)
            if meta.get('executor') == 'test_execution': continue
            pref = item.get('modelPreference') or {}
            if not isinstance(pref,dict):raise ValueError('技能模型偏好格式无效：'+item['id'])
            mode = pref.get('mode', 'inherit')
            if mode == 'none': continue
            explicit=meta.get('model') or (pref.get('model') if mode=='specific' else '')
            selected=explicit or (doc.tiers.get(pref.get('tier','均衡'),'') if mode=='tier' else doc.defaults.skill or doc.defaults.general)
            dependency=('tier:'+pref.get('tier','均衡')) if mode=='tier' and not explicit else 'default:skill'
            locks = self.portal.resource_locks('skill', item['id'])
            reason = '内置技能只读；默认引用由默认设置解析' if builtin else '被未关闭任务引用：'+'、'.join(locks) if locks else ''
            add('skill:'+item['id'], 'skill', item['name'], selected, inherited=not explicit, dependency=dependency,
                reason=reason, path=entry, resource=item['id'], revision=item['revision'], required=set(pref.get('capabilities', [])) | ({'structured'} if meta.get('executor') else set()),minimum=pref.get('minTier'))
            skill_details[item['id']]={'required':list(set(pref.get('capabilities', [])) | ({'structured'} if meta.get('executor') else set())),'minimum':pref.get('minTier')}
            if selected:skill_refs[item['id']] = selected
        for flow in self.library.list('workflows'):
            from beivymate.configuration.loader import load_workflow_definition
            definition = load_workflow_definition(Path(flow['path']))
            locks = self.portal.resource_locks('workflow', flow['id'])
            reason = '内置工作流只读' if flow['builtin'] else '被未关闭任务引用：'+'、'.join(locks) if locks else ''
            for step in definition.resolved_steps():
                explicit = getattr(step,'model',None)
                add('workflow:'+flow['id']+':'+step.id, 'workflow', flow['name']+' / '+step.id, explicit or skill_refs.get(step.skill),
                    inherited=not explicit, dependency='skill:'+step.skill, reason=reason, path=flow['path'], resource=flow['id'], revision=flow['revision'],required=skill_details.get(step.skill,{}).get('required',[]),minimum=skill_details.get(step.skill,{}).get('minimum'))
        # Show actual resource references, not provider-name guesses or frontend samples.
        with self.portal.db() as db:
            self.portal._backfill_references(db)
            tasks = db.execute("SELECT e.id,e.owner,r.kind,r.resource FROM entity e JOIN resource_reference r ON r.task=e.id LEFT JOIN task_lifecycle l ON l.task=e.id WHERE e.owner=? AND e.deleted=0 AND l.closed_at IS NULL", (owner,)).fetchall()
        seen = set()
        for task in tasks:
            model = task['resource'] if task['kind']=='model' else skill_refs.get(task['resource']) if task['kind']=='skill' else None
            if model and (task['id'],model) not in seen:
                seen.add((task['id'],model))
                add('task:'+task['id']+':'+model, 'task', '未关闭任务 '+task['id'], model,
                    reason='任务配置与运行快照保持原样', resource=task['id'])
        return refs

    def preview(self, owner, source, target=None, action='replace'):
        doc, revision = self.catalog._read(owner)
        old = next((m for m in doc.models if m.id==source), None)
        if old is None: raise ValueError('模型不存在，请重新加载')
        refs = [r for r in self.references(owner) if r['model']==source]
        if target:
            for ref in refs:
                if not set(ref['required']).issubset(target.capabilities):
                    ref.update(eligible=False, reason='目标模型不满足所需能力')
                from .catalog import TIERS
                if ref['minimum'] in TIERS and TIERS.index(target.orientation)>TIERS.index(ref['minimum']):ref.update(eligible=False,reason='目标模型低于引用要求的最低档位')
                if ref['kind']=='tier' and target.id in doc.backups[ref['id'].split(':',1)[1]]:ref.update(eligible=False,reason='目标已在该备用链中，请先调整主备配置')
                if ref['kind']=='backup':
                    tier=ref['id'].split(':')[1]
                    if target.id in doc.backups[tier] or doc.tiers[tier]==target.id:ref.update(eligible=False,reason='目标已在该调用链中，请先调整主备配置')
                if ref['kind'] in ('tier','backup') and target.orientation!=old.orientation:
                    ref.update(eligible=False, reason='目标档位不同，请先调整主备配置')
        if target:
            indexed={r['id']:r for r in refs}
            for descendant in refs:
                if set(descendant['required']).issubset(target.capabilities):continue
                parent=descendant['dependency'];seen=set()
                while parent and parent not in seen:
                    seen.add(parent)
                    if parent not in indexed:break
                    indexed[parent].update(eligible=False,reason='目标缺少下级引用所需能力：'+descendant['name'])
                    parent=indexed[parent]['dependency']
        # Capture complete files, so changes to sibling workflow steps invalidate preview too.
        files = {r['path']: hashlib.sha256(Path(r['path']).read_bytes()).hexdigest() for r in refs if r['path']}
        revision = digest([revision, refs, files, action, target.model_dump() if target else None])
        blockers = [r for r in refs if not r['eligible']]
        return {'source':old.model_dump(), 'target':target.model_dump() if target else None, 'items':refs,
                'revision':revision, 'action':action, 'canDelete':not blockers,
                'note':'勾选项应用新模型；未勾选的可编辑间接引用固定为原模型。内置、未关闭任务及其锁定资源保持不变。'}

    @staticmethod
    def skill_content(content, target):
        lines = content.splitlines(keepends=True)
        end = next(i for i in range(1,len(lines)) if lines[i].strip()=='---')
        header = ''.join(lines[1:end])
        from beivymate.markdown.metadata import parse_markdown
        meta,_=parse_markdown(content)
        pref=meta.get('model_preference') or {}
        if isinstance(pref,str):pref=json.loads(pref)
        pref={**pref,'mode':'specific','model':target}
        header = re.sub(r'(?m)^(model|model_preference|state):[^\r\n]*\r?\n?', '', header)
        header += 'model: '+json.dumps(target)+'\nmodel_preference: '+json.dumps(pref,ensure_ascii=False)+'\nstate: draft\n'
        return lines[0]+header+''.join(lines[end:])

    @staticmethod
    def workflow_content(content, step, target):
        parts = re.split(r'(^## 步骤：[^\n]+\n)',content,flags=re.M)
        for i in range(1,len(parts),2):
            if parts[i].partition('：')[2].strip()==step:
                parts[i+1]=re.sub(r'(?m)^- 模型：[^\n]*\n?', '', parts[i+1])
                parts[i+1]='- 模型：'+target+'\n'+parts[i+1]
                return ''.join(parts)
        raise ValueError('工作流步骤不存在')

    def apply(self, owner, source, body, target=None, action='replace'):
        preview = self.preview(owner, source, target, action)
        if body.get('revision')!=preview['revision']: raise FileExistsError('配置或引用已变化，请重新预览')
        selected = body.get('selected', [])
        if not isinstance(selected,list) or any(not isinstance(s,str) for s in selected) or len(set(selected))!=len(selected): raise ValueError('选择列表无效')
        indexed = {r['id']:r for r in preview['items']}
        if action=='delete':
            if body.get('confirm') is not True: raise ValueError('请确认删除及重新配置影响')
            if not preview['canDelete']: raise IdentityError('存在内置或未关闭任务保护引用，不能删除；请先处理引用。',409)
            selected=list(indexed)
        elif (indexed and not selected) or any(s not in indexed or not indexed[s]['eligible'] for s in selected):
            raise ValueError('请选择可修改引用，受保护对象不能替换')
        if target:
            for ref in preview['items']:
                dependency=ref['id']; seen=set(); affected=False
                while dependency and dependency not in seen:
                    seen.add(dependency)
                    if dependency in selected:affected=True;break
                    dependency=indexed.get(dependency,{}).get('dependency','')
                from .catalog import TIERS
                if affected and ref['minimum'] in TIERS and TIERS.index(target.orientation)>TIERS.index(ref['minimum']):raise ValueError('目标模型低于引用最低档位：'+ref['name'])
                if affected and not set(ref['required']).issubset(target.capabilities):
                    raise ValueError('目标模型不满足引用所需能力：'+ref['name'])
        mutation = uuid.uuid4().hex
        changes = []
        new_files = {}
        selected_set = set(selected)
        changed_resource = set()
        doc, revision = self.catalog._read(owner)
        source_model = next((m for m in doc.models if m.id==source),None)
        if source_model is None:raise FileExistsError('模型已变化，请重新预览')
        if target and not any(m.id==target.id for m in doc.models): doc.models.append(target)
        replacement = 'missing:'+source if action=='delete' else target.id
        if action=='replace' and not indexed:
            doc.models=[m for m in doc.models if m.id!=source]
        if action=='delete':
            doc.missingModels[source]=source_model.name
            doc.models=[m for m in doc.models if m.id!=source]
            if not any(m.serviceId==source_model.serviceId for m in doc.models):
                doc.services=[s for s in doc.services if s.id!=source_model.serviceId]
        with exclusive_file(self.catalog.path(owner).with_suffix('.lock')):
            # The preview includes locks and inheritance: re-check before taking write locks.
            if self.preview(owner,source,target,action)['revision']!=preview['revision']: raise FileExistsError('引用已变化，请重新预览')
            with self.portal.db() as db, ExitStack() as stack:
                stack.enter_context(self.portal.skill_center.lock)
                stack.enter_context(self.library.lock)
                stack.enter_context(exclusive_file(self.portal.skill_center.custom / '.skill-center.lock')) if self.portal.skill_center.custom.exists() else None
                db.execute('ATTACH DATABASE ? AS chatdb', (str(self.conversations.path),))
                db.execute('ATTACH DATABASE ? AS registrydb', (str(self.portal.skill_center.registry.database),))
                for ref in preview['items']:
                    apply = ref['id'] in selected_set
                    parent_changed = ref['dependency'] in selected_set
                    # Resolve transitive dependency changes (general -> skill default -> skill -> flow).
                    dep=ref['dependency']
                    visited=set()
                    while dep and dep not in visited:
                        visited.add(dep)
                        if dep in selected_set: parent_changed=True;break
                        dep=indexed.get(dep,{}).get('dependency','')
                    pin = ref['inherited'] and parent_changed and not apply and ref['eligible']
                    if not apply and not pin: continue
                    if ref['kind'] in ('skill','workflow'):
                        kind=ref['kind']; resource=ref['resource']
                        locks=self.portal._resource_locks(db,kind,resource)
                        if locks: raise IdentityError('资源被未关闭任务引用，未提交任何修改：'+'、'.join(locks),409)
                        path=Path(ref['path'])
                        if path.is_symlink(): raise ValueError('配置文件不能为符号链接')
                        content=new_files.get(str(path),path.read_text())
                        value=replacement if apply else source
                        content=self.skill_content(content,value) if kind=='skill' else self.workflow_content(content,ref['id'].rsplit(':',1)[1],value)
                        new_files[str(path)]=content
                        changed_resource.add((kind,resource,str(path)))
                    elif ref['kind']=='default': setattr(doc.defaults,ref['id'].split(':',1)[1],replacement if apply else source)
                    elif ref['kind']=='tier': doc.tiers[ref['id'].split(':',1)[1]]=replacement
                    elif ref['kind']=='backup':
                        tier=ref['id'].split(':')[1]
                        doc.backups[tier]=[target.id if v==source else v for v in doc.backups[tier]] if target else [v for v in doc.backups[tier] if v!=source]
                    elif ref['kind']=='chat':
                        current=db.execute('SELECT model FROM chatdb.preference WHERE owner=? AND context=?',(owner,ref['resource'])).fetchone()
                        if not current or current[0]!=ref['revision']:raise FileExistsError('对话选择已变化')
                        db.execute('UPDATE chatdb.preference SET model=? WHERE owner=? AND context=?',(replacement if apply else source,owner,ref['resource']))
                    changes.append({'id':ref['id'],'from':source,'to':replacement if apply else source,'keptOriginal':pin})
                from beivymate.models.schema import Catalog
                doc=Catalog.model_validate(doc.model_dump())
                self.catalog._check(doc)
                if self.catalog._read(owner)[1]!=revision: raise FileExistsError('模型配置已变化')
                for ref in preview['items']:
                    if ref['path'] and ref['kind']=='workflow' and hashlib.sha256(Path(ref['path']).read_bytes()).hexdigest()!=ref['revision']:raise FileExistsError('工作流文件已变化')
                    if ref['kind']=='skill' and ref['path'] in new_files and self.portal.skill_center.package(Path(ref['path']),False,observe=False)['revision']!=ref['revision']:raise FileExistsError('技能包已变化')
                new_files[str(self.catalog.path(owner))]=doc.model_dump_json(indent=2)
                journal={'id':mutation,'files':[{'path':path,'before':base64.b64encode(Path(path).read_bytes()).decode(),'after':hashlib.sha256(new_files[path].encode()).hexdigest()} for path in new_files]}
                atomic_write(self.journal,json.dumps(journal).encode());self.journal.chmod(0o600)
                try:
                    for path,content in new_files.items(): atomic_write(path,content.encode())
                    for kind,resource,path in changed_resource:
                        rev=self.portal.skill_center.package(Path(path),False,observe=False)['revision'] if kind=='skill' else hashlib.sha256(Path(path).read_bytes()).hexdigest()
                        db.execute('INSERT OR REPLACE INTO registrydb.resource VALUES(?,?,?,?,?,?)',(kind,resource,rev,'draft',None,'[]'))
                    db.execute('INSERT INTO model_operation VALUES(?,?,?,?,?,?,?)',(mutation,owner,datetime.now(timezone.utc).isoformat(),action,source_model.identifier,target.identifier if target else '',json.dumps(changes,ensure_ascii=False)))
                    db.commit()
                except BaseException:
                    db.rollback()
                    for item in journal['files']: atomic_write(item['path'],base64.b64decode(item['before']))
                    self.journal.unlink(missing_ok=True)
                    raise
            self.journal.unlink(missing_ok=True)
        return {'operation':mutation,'changed':changes,'note':'配置已更新；修改后的技能需重新验证发布，任务历史保持不变。'}

    def workflow_publication(self,owner,identity,publish=False):
        entry=next((item for item in self.library.list('workflows') if item['id']==identity),None)
        if not entry or entry['builtin']:raise ValueError('请选择本机自定义工作流')
        from beivymate.configuration.loader import load_workflow_definition
        definition=load_workflow_definition(Path(entry['path']))
        catalog_revision=self.catalog._read(owner)[1]
        errors=[]
        if not publish:
            for step in definition.resolved_steps():
                try:
                    self.portal.skill_center.require_published(step.skill)
                    skill_entry,_=self.portal.skill_center._entry(step.skill)
                    meta,_=read_markdown(skill_entry)
                    if meta.get('executor')=='test_execution':continue
                    preference=meta.get('model_preference') or {}
                    if isinstance(preference,str):preference=json.loads(preference)
                    selected=step.model or meta.get('model')
                    if selected:preference={**preference,'mode':'specific','model':selected}
                    self.catalog.snapshot(owner,selection=preference or None,required=['structured'] if meta.get('executor') else ['text'])
                except (ValueError,OSError) as exc:errors.append(step.id+'：'+str(exc))
        with exclusive_file(self.catalog.path(owner).with_suffix('.lock')), self.portal.resource_guard('workflow',identity), self.library.lock:
            if self.catalog._read(owner)[1]!=catalog_revision or hashlib.sha256(Path(entry['path']).read_bytes()).hexdigest()!=entry['revision']:raise FileExistsError('配置已变化，请重新验证')
            registry=self.portal.skill_center.registry
            if publish:
                registry.publish('workflow',identity,entry['revision'])
                return {'state':'published','errors':[]}
            return registry.validate('workflow',identity,entry['revision'],errors)

    def history(self, owner):
        with self.portal.db() as db:
            rows=[dict(r) for r in db.execute('SELECT id,owner,at,action,source,target,changes FROM model_operation WHERE owner=? ORDER BY at DESC LIMIT 100',(owner,))]
        identity=self.catalog.root/'identity.sqlite3'
        actor='本机账户'
        if identity.exists():
            with sqlite3.connect(identity.as_uri()+'?mode=ro',uri=True) as account:
                row=account.execute('SELECT name FROM account WHERE id=?',(owner,)).fetchone()
                if row:actor=row[0]
        return [{**row,'actor':actor} for row in rows]
