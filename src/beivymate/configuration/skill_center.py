"""Discover real on-disk packages; the browser never owns the skill library."""
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import tempfile
from threading import RLock
from contextlib import nullcontext
from beivymate.foundation.resources import ResourceRegistry

from beivymate.markdown.metadata import read_markdown
from beivymate.configuration.integrity import verify_bundled

BUILTIN_SKILLS = Path(__file__).resolve().parents[1] / 'builtin/skills'
from beivymate.foundation.paths import data_directory
CUSTOM_SKILLS = data_directory() / 'skills'
STATES = {'draft', 'published', 'paused'}
ROLES = {'tester', 'developer', 'product', 'operations', 'common'}
MAX_TOTAL = 20 * 1024 * 1024


def safe_path(name):
    if not isinstance(name, str) or not name or '\\' in name or '\x00' in name:
        raise ValueError('技能包文件路径无效')
    path = PurePosixPath(name)
    if path.is_absolute() or any(p in ('', '.', '..') or p.startswith('.') for p in name.split('/')):
        raise ValueError('技能包文件不能越过包目录或包含隐藏路径')
    return path


class SkillCenter:
    def __init__(self, custom: Path, builtin: Path = BUILTIN_SKILLS, *, registry=None, guard=None):
        self.custom, self.builtin = custom.resolve(), builtin.resolve()
        self.lock = RLock()
        self.registry = registry or ResourceRegistry(self.custom / ".client-state/resources.sqlite3")
        self.guard = guard or (lambda identity: nullcontext())

    def package(self, entry, builtin, *, observe=True):
        with self.lock:
            return self._package(entry,builtin,observe=observe)

    def _package(self, entry, builtin, *, observe=True):
        directory = entry.parent
        root = self.builtin if builtin else self.custom
        if entry.is_symlink() or not entry.resolve().is_relative_to(root):
            raise ValueError('技能包不能引用目录外文件')
        metadata, body = read_markdown(entry)
        for key in ('roles', 'model_preference'):
            if isinstance(metadata.get(key), str):
                try:
                    metadata[key] = json.loads(metadata[key])
                except ValueError:
                    raise ValueError('技能元数据格式无效：' + key) from None
        if not isinstance(metadata.get('roles', [metadata.get('role', 'common')]), list) or any(not isinstance(r, str) or r not in ROLES for r in metadata.get('roles', [])):
            raise ValueError('技能适用角色无效')
        identity = metadata.get('id', directory.name)
        if not isinstance(identity, str) or not re.fullmatch(r'[a-z][a-z0-9_-]*', identity):
            raise ValueError('技能标识只能使用小写字母、数字、下划线、短横线')
        if not all(isinstance(metadata.get(k), str) and metadata[k].strip() for k in ('name', 'description')) or not body:
            raise ValueError('SKILL.md 需要名称、描述和工作指令')
        role = metadata.get('role', 'common')
        if not isinstance(role, str) or role not in ROLES:
            raise ValueError('技能角色无效')
        files, digest, total = [], hashlib.sha256(), 0
        updated = entry.stat().st_mtime
        for path in sorted(directory.rglob('*')):
            if any(p.startswith('.') for p in path.relative_to(directory).parts):
                continue
            if path.is_symlink():
                raise ValueError('技能包不支持符号链接')
            if not path.is_file():
                continue
            name = path.relative_to(directory).as_posix()
            safe_path(name)
            if path != entry and path.name == 'SKILL.md':
                raise ValueError('单个技能包不能嵌套其他技能包')
            if path.stat().st_size > 5 * 1024 * 1024:
                raise ValueError('技能包单文件不能超过 5 MB')
            raw = path.read_bytes(); total += len(raw)
            if total > MAX_TOTAL or len(files) >= 100:
                raise ValueError('技能包不能超过 100 个文件或 20 MB')
            if builtin:
                verify_bundled(path)
            digest.update(name.encode()); digest.update(hashlib.sha256(raw).digest())
            updated = max(updated, path.stat().st_mtime)
            if path == entry:
                continue
            try:
                text = raw.decode('utf-8')
                files.append({'path': name, 'text': text, 'size': len(raw)})
            except UnicodeDecodeError:
                files.append({'path': name, 'content': base64.b64encode(raw).decode(), 'size': len(raw)})
        # Preserve executable metadata exactly, including multiline lists.
        raw_header = entry.read_text().split('---', 2)[1]
        extras, keep = [], False
        display = {'id', 'name', 'description', 'role', 'roles', 'icon', 'version', 'model_preference', 'state'}
        for line in raw_header.splitlines():
            match = re.match(r'^([a-z_]+):', line)
            if match:
                keep = match[1] not in display
            if keep:
                extras.append(line)
        state = 'published' if builtin else self.registry.observe('skill', identity, digest.hexdigest())['state'] if observe else 'draft'
        from datetime import datetime, timezone
        result = dict(key=identity, id=identity, name=metadata['name'], description=metadata['description'],
            role=role, roles=metadata.get('roles', [role]), version=str(metadata.get('version', '1')),
            body=body, extraFrontmatter='\n'.join(extras).strip(), icon=metadata.get('icon', '🧩'),
            source='builtin' if builtin else 'custom', state=state, files=files,
            updated=datetime.fromtimestamp(updated, timezone.utc).isoformat(), revision=digest.hexdigest())
        if not builtin and observe:
            result['validationErrors'] = self.registry.observe('skill', identity, result['revision'])['errors']
        if metadata.get('model_preference'):
            result['modelPreference'] = metadata['model_preference']
        return result

    def scan(self):
        with self.lock:
            return self._scan()

    def _scan(self):
        items, errors, seen = [], [], set()
        for root, builtin in ((self.builtin, True), (self.custom, False)):
            if not root.exists():
                continue
            for entry in sorted(root.rglob('SKILL.md')):
                if any(p.startswith('.') for p in entry.relative_to(root).parts):
                    continue
                try:
                    item = self.package(entry, builtin)
                    if item['id'] in seen:
                        raise ValueError('技能标识重复，请修改自定义包标识：' + item['id'])
                    seen.add(item['id']); items.append(item)
                except (ValueError, OSError, UnicodeError) as exc:
                    errors.append({'path': str(entry), 'message': str(exc)})
        return {'items': items, 'errors': errors}

    def save(self, identity, body):
        if not re.fullmatch(r'[a-z][a-z0-9_-]*', identity):
            raise ValueError('技能标识无效')
        if not isinstance(body, dict) or not isinstance(body.get('content'), str) or not isinstance(body.get('files', []), list):
            raise ValueError('技能包请求无效')
        if not isinstance(body.get('state'), str) or body.get('state') not in STATES:
            raise ValueError('技能状态无效')
        self.custom.mkdir(parents=True, exist_ok=True)
        from beivymate.scheduling.locking import exclusive_file
        with self.guard(identity), self.lock, exclusive_file(self.custom / '.skill-center.lock'):
            existing = next((s for s in self.scan()['items'] if s['id'] == identity), None)
            if existing and existing['source'] == 'builtin':
                raise PermissionError('内置技能只读，请创建副本')
            if (existing or {}).get('revision') != body.get('revision'):
                raise FileExistsError('技能包已被修改，请重新加载后核对')
            self.custom.mkdir(parents=True, exist_ok=True)
            entries = [p for p in self.custom.rglob('SKILL.md') if not any(x.startswith('.') for x in p.relative_to(self.custom).parts)]
            target = next((p.parent for p in entries if self._identity(p) == identity), self.custom / identity)
            if target.is_symlink() or not target.resolve().is_relative_to(self.custom):
                raise ValueError('技能目录无效')
            if not existing and target.exists():
                raise FileExistsError('目标目录已存在，请检查包结构')
            with tempfile.TemporaryDirectory(dir=self.custom, prefix='.draft-') as temporary:
                staging = Path(temporary) / identity; staging.mkdir()
                content = body['content']
                # State lives with the package, so copied folders remain authoritative.
                header, sep, rest = content.removeprefix('\ufeff').partition('\n---')
                if not header.startswith('---\n') or not sep:
                    raise ValueError('SKILL.md 元数据格式无效')
                header = re.sub(r'^state:.*\n?', '', header, flags=re.M)
                (staging / 'SKILL.md').write_text(header + '\nstate: ' + body['state'] + sep + rest)
                seen, total = {'SKILL.md'}, len(content.encode())
                for item in body.get('files', []):
                    if not isinstance(item, dict):
                        raise ValueError('技能包文件无效')
                    name = item.get('path'); safe_path(name)
                    if name in seen or name.endswith('/SKILL.md'):
                        raise ValueError('技能包路径重复或嵌套')
                    seen.add(name)
                    if isinstance(item.get('text'), str):
                        raw = item['text'].encode()
                    elif isinstance(item.get('content'), str):
                        try:
                            raw = base64.b64decode(item['content'], validate=True)
                        except ValueError:
                            raise ValueError('二进制资源编码无效') from None
                    else:
                        raise ValueError('技能资源缺少完整文件内容')
                    total += len(raw)
                    if len(raw) > 5 * 1024 * 1024 or total > MAX_TOTAL or len(seen) > 100:
                        raise ValueError('技能包超过文件数量或大小限制')
                    dest = staging / name; dest.parent.mkdir(parents=True, exist_ok=True); dest.write_bytes(raw)
                value = self.package(staging / 'SKILL.md', False, observe=False)
                if body['state'] == 'published' and not body.get('imported'):
                    self._validation_errors(value, staging / 'SKILL.md', raise_error=True)
                if value['id'] != identity:
                    raise ValueError('技能标识与路径标识不一致')
                # Keep a rollback copy until the complete package has been installed.
                backup = Path(temporary) / 'previous'
                if existing:
                    if self.package(target / 'SKILL.md', False)['revision'] != body.get('revision'):
                        raise FileExistsError('技能文件已被外部修改，请重新加载后核对')
                    os.replace(target, backup)
                try:
                    os.replace(staging, target)
                except OSError:
                    if backup.exists():
                        os.replace(backup, target)
                    raise
            saved = self.package(target / 'SKILL.md', False)
            if body.get('imported'):
                # The receiver cannot inherit a sender's publication state.
                return saved
            revision = saved['revision']
            if body['state'] == 'draft':
                self.registry.draft('skill', identity, revision)
            elif body['state'] == 'paused':
                self.registry.pause('skill', identity, revision)
            elif body['state'] == 'published':
                self._validate(saved)
                self.registry.publish('skill', identity, revision)
            return self.package(target / 'SKILL.md', False)

    def _entry(self, identity):
        for root, builtin in ((self.builtin, True), (self.custom, False)):
            for path in sorted(root.rglob('SKILL.md')):
                if not any(p.startswith('.') for p in path.relative_to(root).parts) and self._identity(path) == identity:
                    return path, builtin
        raise ValueError('技能包不存在：' + identity)

    def _validation_errors(self, item, entry, *, raise_error=False):
        errors = []
        try:
            from beivymate.configuration.skill_package import load_skill
            spec = load_skill(entry)
            available = [load_skill(p) for p in self.builtin.rglob('SKILL.md')]
            executor = next((s for s in available if s.executor == spec.executor), None)
            if executor is None or spec.role != executor.role or spec.outputs != executor.outputs:
                raise ValueError('技能需要已注册的执行器及匹配的角色、输入输出契约')
            if spec.executor in {'requirement_understand', 'test_analysis', 'test_design'}:
                if not (entry.parent / 'templates').is_dir():
                    raise ValueError('执行器需要的 templates 目录缺失')
        except (ValueError, OSError) as exc:
            errors.append(str(exc))
        if errors and raise_error:
            raise ValueError('技能验证失败：' + '；'.join(errors))
        return errors

    def _validate(self, item):
        entry, _ = self._entry(item['id'])
        errors = self._validation_errors(item, entry)
        self.registry.validate('skill', item['id'], item['revision'], errors)
        if errors:
            raise ValueError('技能验证失败：' + '；'.join(errors))

    def transition(self, identity, action, revision):
        with self.guard(identity), self.lock:
            entry, builtin = self._entry(identity)
            item = self.package(entry, builtin)
            if builtin:
                raise PermissionError('内置技能只读，请创建副本')
            if item['revision'] != revision:
                raise FileExistsError('技能包已变化，请重新加载')
            if action == 'validate':
                errors = self._validation_errors(item, entry)
                self.registry.validate('skill',identity,revision,errors)
            elif action == 'publish':
                self.registry.publish('skill',identity,revision)
            elif action == 'pause':
                self.registry.pause('skill',identity,revision)
            else:
                raise ValueError('不支持的技能状态操作')
            return self.package(entry, False)

    def require_published(self, identity):
        entry, builtin = self._entry(identity)
        item = self.package(entry, builtin)
        if not builtin:
            self.registry.require_published('skill',identity,item['revision'])
        return item

    @staticmethod
    def _identity(entry):
        try:
            metadata, _ = read_markdown(entry)
            return metadata.get('id', entry.parent.name)
        except (ValueError, OSError):
            return None
