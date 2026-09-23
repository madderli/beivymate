"""One file is authoritative for both UI editing and manual configuration edits."""
import hashlib
import os
from pathlib import Path
import re
import shutil
import tempfile
from threading import RLock
from beivymate.configuration.skill_package import load_skill
from beivymate.configuration.loader import load_workflow_definition, load_model_definition


class ConfigurationLibrary:
    def __init__(self, builtin: Path, customer: Path):
        self.builtin, self.customer = builtin.resolve(), customer.resolve()
        self.lock = RLock()

    def paths(self, kind):
        if kind not in ('skills', 'workflows', 'models'):
            raise ValueError('配置类型无效')
        bundled = self.builtin / {'skills':'skills', 'workflows':'configuration/workflow', 'models':'configuration/llm/model'}[kind]
        custom = self.customer / kind
        pattern = '**/SKILL.md' if kind == 'skills' else '*.md'
        return [(p, True) for p in sorted(bundled.glob(pattern))] + [(p, False) for p in sorted(custom.glob(pattern))]

    def list(self, kind):
        result = []
        for path, builtin in self.paths(kind):
            root = self.builtin if builtin else self.customer
            if not path.resolve().is_relative_to(root):
                raise ValueError('配置路径超出管理目录')
            definition = {'skills':load_skill,'workflows':load_workflow_definition,'models':load_model_definition}[kind](path)
            if any(item['id'] == definition.id for item in result):
                raise ValueError('配置标识重复：' + definition.id)
            content = path.read_bytes()
            result.append({'id': definition.id, 'name': definition.name, 'builtin': builtin,
                'revision': hashlib.sha256(content).hexdigest(), 'content': content.decode(), 'path': str(path)})
        return result

    def save(self, kind, identity, content, revision=None, *, copy_from=None):
        if kind not in ('skills', 'workflows'):
            raise PermissionError('当前只允许编辑技能和工作流')
        if not re.fullmatch(r'[a-z][a-z0-9_-]*', identity):
            raise ValueError('配置标识只能使用小写字母、数字、下划线及连字符')
        with self.lock:
            entries = self.list(kind)
            old = next((e for e in entries if e['id'] == identity), None)
            if old and old['builtin']:
                raise PermissionError('系统默认配置只读，请创建自定义副本')
            if old and revision != old['revision']:
                raise FileExistsError('文件已修改，请保留草稿并对照最新版本')
            if not old and revision is not None:
                raise FileExistsError('配置已删除，不能覆盖')
            directory = self.customer / kind
            if not directory.resolve().is_relative_to(self.customer):
                raise ValueError('配置目录不能指向管理目录之外')
            directory.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(dir=directory, prefix='.draft-') as temporary:
                staging = Path(temporary)
                if kind == 'skills':
                    if not old and not copy_from:
                        raise ValueError('请从已有 Skill 创建副本，执行器能力由系统提供')
                    source = old or next((e for e in entries if e['id'] == copy_from), None)
                    if not source:
                        raise ValueError('源 Skill 不存在')
                    source_dir = Path(source['path']).parent
                    if any(p.is_symlink() for p in source_dir.rglob('*')):
                        raise ValueError('Skill 包不能包含符号链接')
                    shutil.copytree(source_dir, staging, dirs_exist_ok=True, ignore=shutil.ignore_patterns('.*'))
                target = staging / ('SKILL.md' if kind == 'skills' else identity + '.md')
                target.write_text(content, encoding='utf-8')
                definition = load_skill(target) if kind == 'skills' else load_workflow_definition(target)
                if kind == 'skills':
                    executors = [load_skill(p) for p, builtin in self.paths('skills') if builtin]
                    executor = next((item for item in executors if item.executor == definition.executor), None)
                    if executor is None or definition.role != executor.role or definition.outputs != executor.outputs:
                        raise ValueError('Skill 执行器、角色及必要输出契约必须匹配已注册能力')
                if kind == 'workflows':
                    skills = {load_skill(p).id: load_skill(p) for p, _ in self.paths('skills')}
                    for step in definition.resolved_steps():
                        if step.skill not in skills:
                            raise ValueError('工作流引用了不存在的 Skill：' + step.skill)
                        if step.analysis_strategy and step.analysis_strategy not in skills[step.skill].analysis_strategies:
                            raise ValueError('该步骤 Skill 不支持所选分析策略：' + step.id)
                if definition.id != identity:
                    raise ValueError('文件标识与保存标识不一致')
                if old:
                    if hashlib.sha256(Path(old['path']).read_bytes()).hexdigest() != revision:
                        raise FileExistsError('文件已被外部修改')
                    os.replace(target, old['path'])
                elif kind == 'skills':
                    destination = directory / identity
                    if destination.exists():
                        raise FileExistsError('目标 Skill 目录已存在')
                    # Rename complete package, then recreate staging for context cleanup.
                    os.rename(staging, destination)
                    staging.mkdir()
                else:
                    destination = directory / target.name
                    with destination.open('x', encoding='utf-8') as stream:
                        stream.write(content)
            return next(e for e in self.list(kind) if e['id'] == identity)

    def templates(self, identity):
        import base64
        skill = next((item for item in self.list('skills') if item['id'] == identity), None)
        if skill is None:
            raise ValueError('Skill 不存在')
        directory = Path(skill['path']).parent
        reference_only = load_skill(Path(skill['path'])).executor == 'test_execution'
        items = []
        for path in sorted((directory / 'templates').rglob('*')):
            if not path.is_file() or path.suffix not in ('.md','.xlsx','.docx') or any(part.startswith('.') for part in path.relative_to(directory).parts):
                continue
            if path.is_symlink() or not path.resolve().is_relative_to(directory.resolve()):
                raise ValueError('模板路径超出 Skill 包')
            from beivymate.configuration.integrity import verify_bundled
            verify_bundled(path)
            content = path.read_bytes()
            items.append({'name': str(path.relative_to(directory)), 'builtin': skill['builtin'],
                          'usage': 'reference' if reference_only else 'template',
                          'usageDescription': '参考资料；执行服务的表格格式由程序契约控制，修改本文件不会改变执行计划、缺陷或执行结果导出。' if reference_only else '执行器使用此模板生成产物。',
                          'revision': hashlib.sha256(content).hexdigest(), 'path': str(path),
                          'text': content.decode('utf-8') if path.suffix == '.md' else None,
                          'content': base64.b64encode(content).decode('ascii')})
        return items

    def save_template(self, identity, name, content: bytes, revision):
        with self.lock:
            template = next((item for item in self.templates(identity) if item['name'] == name), None)
            if template is None:
                raise ValueError('模板不存在，请从 Skill 副本中选择模板')
            if template['builtin']:
                raise PermissionError('系统默认模板只读，请先复制 Skill')
            if revision != template['revision']:
                raise FileExistsError('模板已有修改，请对照最新版本')
            path = Path(template['path'])
            if path.suffix == '.md':
                content.decode('utf-8')
            elif path.suffix in ('.xlsx', '.docx'):
                import io
                from zipfile import ZipFile, BadZipFile
                try:
                    with ZipFile(io.BytesIO(content)) as package:
                        marker = 'xl/workbook.xml' if path.suffix == '.xlsx' else 'word/document.xml'
                        if marker not in package.namelist():
                            raise ValueError('文件类型与模板不一致')
                except BadZipFile:
                    raise ValueError('模板不是有效 Office 文档') from None
            else:
                raise ValueError('不支持的模板格式')
            temporary = None
            try:
                with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
                    temporary = Path(stream.name)
                    stream.write(content)
                if path.suffix == '.md' and path.read_text(encoding='utf-8').lstrip().startswith('---'):
                    from beivymate.configuration.loader import load_template_definition
                    load_template_definition(temporary)
                if hashlib.sha256(path.read_bytes()).hexdigest() != revision:
                    raise FileExistsError('模板已被外部修改')
                os.replace(temporary, path)
            finally:
                if temporary and temporary.exists():
                    temporary.unlink()
            return next(item for item in self.templates(identity) if item['name'] == name)
