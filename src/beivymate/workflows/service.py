"""Backend-owned workflow definitions; runtime projections exist only while enabled."""
from pathlib import Path
from threading import RLock
import hashlib
import json
import os
import re
import tempfile
import uuid
from datetime import datetime, timezone
from pydantic import BaseModel, ConfigDict, Field
from typing import Literal
from beivymate.scheduling.locking import exclusive_file

class Step(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: str = Field(pattern=r'^[a-z][a-z0-9_]{0,63}$')
    skill: str = Field(max_length=128)
    model: str = Field(default='default', max_length=160)
    confirmation: Literal['inherit', 'human', 'auto'] = 'inherit'
    supplement: str = Field(default='', max_length=4000)
    analysisStrategy: Literal['simple', 'standard', 'deep'] | None = None
    inputs: list[str] = Field(default_factory=lambda: ['task'], max_length=100)
    outputRequirements: str = Field(default='', max_length=8000)

class Definition(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default='', max_length=1024)
    icon: str = Field(default='wf:branch', min_length=1, max_length=16)
    roles: list[Literal['tester','developer','product','operations','implementation','common']] = Field(default_factory=list, max_length=6)
    confirmation: Literal['human','auto'] = 'human'
    inputRequirements: str = Field(default='', max_length=8000)
    steps: list[Step] = Field(default_factory=list, max_length=100)

class Workflows:
    def __init__(self, root, skills, registry, portal, catalog):
        self.root=Path(root).resolve();self.directory=self.root/'.library'
        if self.directory.is_symlink():raise ValueError('工作流目录不能是符号链接')
        self.directory.mkdir(parents=True,exist_ok=True)
        self.skills,self.registry,self.portal,self.catalog=skills,registry,portal,catalog
        self.lock=RLock()

    def path(self, identity):
        if not re.fullmatch(r'wf-[a-f0-9]{32}',identity):raise ValueError('工作流标识无效')
        path=self.directory/(identity+'.md')
        if path.is_symlink() or not path.resolve().is_relative_to(self.directory.resolve()):raise ValueError('工作流路径无效')
        return path

    def _read(self, identity):
        path=self.path(identity)
        if not path.exists():raise ValueError('工作流不存在，请刷新列表')
        raw=path.read_bytes()
        from beivymate.markdown.metadata import read_markdown
        metadata,_=read_markdown(path)
        value=Definition.model_validate_json(metadata['authoring'])
        return value,hashlib.sha256(raw).hexdigest()

    def _write(self, path, raw):
        fd,name=tempfile.mkstemp(dir=path.parent,prefix='.workflow-')
        try:
            with os.fdopen(fd,'wb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
            os.replace(name,path)
        finally:
            if os.path.exists(name):os.unlink(name)

    def _projection(self, identity):
        p=self.root/(identity+'.md')
        if p.is_symlink():raise ValueError('工作流执行文件不能是符号链接')
        return p

    def _visible(self, value, role):
        return role in value.roles or 'common' in value.roles

    def get(self, identity, role):
        value,revision=self._read(identity)
        if not self._visible(value,role):raise PermissionError('当前角色不可使用此工作流')
        state=self.registry.observe('workflow',identity,revision)
        projection=self._projection(identity)
        if projection.exists() and (state['state']!='published' or hashlib.sha256(projection.read_bytes()).hexdigest()!=revision):
            # External definition changes must not silently keep stale runtime eligibility.
            state={'state':'invalid','errors':['工作流内容或执行文件已变化，请先处理引用并停用，再检查配置']}
        with self.portal.db() as db:
            users=self.portal._resource_locks(db,'workflow',identity)
        return {**value.model_dump(), 'id':identity,'revision':revision,'state':state['state'],
                'legacyNotes':{'input':value.inputRequirements,'outputs':[{'step':i+1,'text':step.outputRequirements} for i,step in enumerate(value.steps) if step.outputRequirements]},'legacyRequirements':bool(value.inputRequirements or any(s.outputRequirements for s in value.steps)),'enabled':projection.exists(),'errors':state['errors'],'references':users,'source':'custom',
                'updated':datetime.fromtimestamp(self.path(identity).stat().st_mtime,timezone.utc).isoformat()}

    def list(self, role):
        items=[];warnings=[]
        for path in sorted(self.directory.glob('*.md')):
            try:
                value,_=self._read(path.stem)
                if self._visible(value,role):items.append(self.get(path.stem,role))
            except (ValueError,OSError,KeyError) as exc:warnings.append(f'{path.stem}：{exc}')
        for legacy in self.root.glob('*.md'):
            if not (self.directory/(legacy.stem+'.md')).exists():warnings.append('保留旧工作流文件：'+legacy.name+'；尚未转换，不会自动改写。')
        return {'items':items,'warnings':warnings,'role':role}

    def errors(self, value, role, owner):
        errors=[]
        if not value.name.strip():errors.append('请填写工作流名称')
        if not value.roles:errors.append('请选择适用角色')
        if not self._visible(value,role):errors.append('适用角色必须包含当前角色或通用')
        if not value.steps:errors.append('请至少添加一个技能步骤')
        if value.inputRequirements or any(s.outputRequirements for s in value.steps):errors.append('旧版输入输出补充需先停用并保存为新配置；原内容将保留历史副本，具体要求请在任务中设置')
        packages={s['id']:s for s in self.skills.scan()['items']}
        seen=set()
        for i,step in enumerate(value.steps):
            prefix=f'第{i+1}步：'
            if step.id in seen:errors.append(prefix+'步骤标识重复')
            skill=packages.get(step.skill)
            if not skill or skill['state']!='published':errors.append(prefix+'技能不存在或未发布')
            else:
                if step.analysisStrategy and step.analysisStrategy not in skill.get('analysisStrategies', []):
                    errors.append(prefix+'技能不支持所选分析策略')
                roles=skill.get('roles',[skill['role']])
                if any('common' not in roles and (r=='common' or r not in roles) for r in value.roles):errors.append(prefix+'技能不适用于所选角色')
                try:self.skills.require_published(step.skill)
                except (ValueError,PermissionError) as exc:errors.append(prefix+str(exc))
                # Reuse the skill model policy, including disabled/retired models and capabilities.
                try:
                    preference=skill.get('modelPreference') or {'mode':'inherit'}
                    if step.model!='default':preference={**preference,'mode':'specific','model':step.model}
                    self.catalog.snapshot(owner,purpose='skill',selection=preference,required=preference.get('capabilities') or ['text'])
                except (ValueError,RuntimeError,OSError) as exc:errors.append(prefix+str(exc))
            seen.add(step.id)
        return errors

    def save(self, identity, body, role, owner):
        identity=identity or 'wf-'+uuid.uuid4().hex
        value=Definition.model_validate(body['definition'])
        for index, step in enumerate(value.steps, start=1):
            if len(step.supplement) > 100:
                raise ValueError(f'第{index}步：补充说明：最多允许 100 个字符，请缩短后保存')
        if not self._visible(value,role):raise ValueError('适用角色必须包含当前角色或通用')
        with self.portal.resource_guard('workflow',identity),self.lock,exclusive_file(self.directory/'.lock'):
            path=self.path(identity)
            if path.exists():
                old_value,old_revision=self._read(identity)
                if not self._visible(old_value,role):raise PermissionError('当前角色不可维护此工作流')
                old={'state':self.registry.observe('workflow',identity,old_revision)['state'],'revision':old_revision}
                if old['state']=='published' or self._projection(identity).exists():raise PermissionError('已启用工作流需先停用再编辑')
                if body.get('revision')!=old['revision']:raise FileExistsError('工作流已修改，请刷新后重试')
            elif body.get('revision'):raise FileExistsError('工作流已删除，请刷新')
            if value.inputRequirements or any(s.outputRequirements for s in value.steps):
                raise ValueError('工作流不再填写输入输出要求，请在任务中设置')
            if path.exists() and (old_value.inputRequirements or any(s.outputRequirements for s in old_value.steps)
                                  or path.read_bytes() != self.markdown(identity, old_value).encode()):
                archive=self.directory/'.history'/identity/(old_revision+'.md')
                if not archive.resolve().is_relative_to(self.directory.resolve()):raise ValueError('历史目录越界')
                archive.parent.mkdir(parents=True,exist_ok=True)
                if not archive.exists():self._write(archive,path.read_bytes())
            for step in value.steps:
                step.inputs = ['task']
            raw=self.markdown(identity,value).encode()
            revision=hashlib.sha256(raw).hexdigest()
            if not path.exists() or path.read_bytes()!=raw:
                self._write(path,raw)
                self.registry.draft('workflow',identity,revision)
        return self.get(identity,role)

    def action(self, identity, body, role, owner):
        with self.portal.resource_guard('workflow',identity),self.lock,exclusive_file(self.directory/'.lock'):
            value,revision=self._read(identity)
            if not self._visible(value,role):raise PermissionError('当前角色不可维护此工作流')
            if body.get('revision')!=revision:raise FileExistsError('内容已变化，请刷新后重试')
            action=body.get('action');state=self.registry.observe('workflow',identity,revision)['state']
            if action=='pause':
                self._projection(identity).unlink(missing_ok=True);self.registry.pause('workflow',identity,revision)
            elif action in ('validate','enable'):
                if state=='published' or self._projection(identity).exists():raise PermissionError('已启用工作流只读，请先停用')
                errors=self.errors(value,role,owner)
                if not errors and self.path(identity).read_bytes() != self.markdown(identity, value).encode():
                    errors.append('请先打开编辑并保存，以更新工作流步骤传递规则')
                self.registry.validate('workflow',identity,revision,errors)
                if action=='enable' and not errors:
                    self._write(self._projection(identity),self.path(identity).read_bytes())
                    try:self.registry.publish('workflow',identity,revision)
                    except Exception:self._projection(identity).unlink(missing_ok=True);raise
            else:raise ValueError('工作流操作无效')
        return self.get(identity,role)

    def markdown(self, identity, value):
        # Existing runtime format; only enabled definitions receive this derived file.
        authoring = value.model_dump()
        for step in authoring['steps']:
            if not step['supplement'].strip():
                del step['supplement']
        head='---\nauthoring: '+json.dumps(authoring,ensure_ascii=False,sort_keys=True)+'\nid: '+identity+'\nname: '+json.dumps(value.name,ensure_ascii=False)+'\ndescription: '+json.dumps(value.description,ensure_ascii=False)+'\n---\n'
        for index, step in enumerate(value.steps):
            confirm = value.confirmation if step.confirmation == 'inherit' else step.confirmation
            head += f'\n## 步骤：{step.id}\n- 技能：{step.skill}\n- 输入：requirement\n'
            head += '- 结果确认：' + ('人工' if confirm == 'human' else '自动') + '\n'
            if index:
                head += '- 上一步：' + value.steps[index - 1].id + '\n'
            if step.supplement.strip():
                head += '- 补充说明：' + json.dumps(step.supplement.strip(), ensure_ascii=False) + '\n'
            if step.analysisStrategy:
                head += '- 分析策略：' + step.analysisStrategy + '\n'
            if step.model != 'default':
                head += '- 模型：' + step.model + '\n'
        return head

    def delete(self, identity, revision, role):
        with self.portal.resource_guard('workflow',identity),self.lock,exclusive_file(self.directory/'.lock'):
            value,current=self._read(identity)
            if not self._visible(value,role):raise PermissionError('当前角色不可维护此工作流')
            if revision!=current:raise FileExistsError('内容已变化，请刷新')
            if self.registry.observe('workflow',identity,current)['state']=='published' or self._projection(identity).exists():raise PermissionError('请先停用再删除')
            self._projection(identity).unlink(missing_ok=True)
            self.path(identity).unlink()
            with self.registry.db() as db:
                db.execute("DELETE FROM resource WHERE kind='workflow' AND id=?",(identity,))
                db.execute("DELETE FROM resource_content_time WHERE kind='workflow' AND id=?",(identity,))
        return {'deleted':True}
