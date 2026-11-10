"""Local creation of instruction skills; deliberately independent of legacy import parsing."""
import json
import re
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

from beivymate.configuration.skill_center import ROLES

ASSETS = Path(__file__).resolve().parents[1] / 'builtin/authoring'
IDENTIFIER = re.compile(r'[a-z0-9]+(?:-[a-z0-9]+)*')
FORMAT = 'instructions-v1'
SETTINGS_FILE = '.beivymate.json'


def authoring_metadata(metadata):
    value = metadata.get('metadata')
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            return None
    if not isinstance(value, dict) or value.get('beivymate-format') != FORMAT:
        return None
    if any(not isinstance(k, str) or not isinstance(v, str) for k, v in value.items()):
        raise ValueError('技能应用元数据必须使用文本字段')
    return value


def skill_settings(value):
    """Application choices are local backend configuration, not skill instructions."""
    return {
        'beivymate-format': FORMAT,
        'beivymate-display-name': value['name'],
        'beivymate-roles': json.dumps(value['roles'], ensure_ascii=False),
        'beivymate-icon': value['icon'],
        'beivymate-model': json.dumps(value['modelPreference'], ensure_ascii=False),
    }


def serialize_skill(value):
    header = '\n'.join(f'{key}: {json.dumps(item, ensure_ascii=False)}' for key, item in
                       [('name', value['id']), ('description', value['description'])])
    body = value['body']
    if not re.search(r'^#\s+\S', body, re.M):
        body = '# ' + re.sub(r'[\r\n]+', ' ', value['name'].strip()) + '\n\n' + body
    return f'---\n{header}\n---\n\n{body}'


class Preference(BaseModel):
    model_config = ConfigDict(extra='forbid')
    mode: str = 'inherit'
    model: str = ''
    capabilities: list[str] = Field(default_factory=list, max_length=0)


class Draft(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default='', max_length=1024)
    roles: list[str] = Field(default_factory=lambda: ['common'], max_length=5)
    icon: str = Field(default='🧩', max_length=32)
    modelPreference: Preference = Field(default_factory=Preference)
    body: str = Field(default='', max_length=100000)
    files: list[dict] = Field(default_factory=list, max_length=99)
    revision: str | None = None


def writing_errors(item):
    """Structural checks do not pretend to judge free-form business requirements."""
    errors = []
    if not item['name'].strip():
        errors.append('请填写技能名称')
    if not item['description'].strip() or len(item['description']) > 1024:
        errors.append('请填写1024字以内的技能描述')
    description_prompts = re.findall(r'【[^】]+】', (ASSETS / 'description-template.txt').read_text(encoding='utf-8'))
    if any(prompt in item['description'] for prompt in description_prompts):
        errors.append('请将技能描述中的【】提示替换为本技能的实际内容')
    if not item.get('roles'):
        errors.append('请选择至少一个适用角色')
    body = item['body'].strip()
    prompts = (ASSETS / 'writing-prompts.md').read_text(encoding='utf-8').strip()
    prompt_lines = {line.strip() for line in prompts.splitlines() if line.strip() and not line.startswith('#')}
    if not re.sub(r'^#{1,6}\s+.*$', '', body, flags=re.M).strip():
        errors.append('请填写实际工作内容，不能只有标题')
    if not body or body == prompts or any(line.strip() in prompt_lines for line in body.splitlines()):
        errors.append('请将技能编写中的默认说明替换为实际业务内容')
    if any(re.fullmatch(r'\s*(?:[-*]\s*)?(?:【[^】]*】|\.{3,}|…+|待填写|TODO)\s*', line, re.I)
           for line in body.splitlines()):
        errors.append('技能内容仍有未填写的占位提示，请完善后再检查')
    from urllib.parse import unquote
    files = {'SKILL.md', *(file['path'] for file in item.get('files', []))}
    for target in re.findall(r'!?\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)', body):
        if target.startswith(('#', 'https://', 'http://', 'mailto:')):
            continue
        target = unquote(target.split('#', 1)[0])
        if target.startswith('./'):
            target = target[2:]
        if target and target not in files:
            errors.append('技能正文引用的资源不存在于包内：' + target)
    return errors


class SkillAuthoring:
    def __init__(self, center, catalog):
        self.center, self.catalog = center, catalog

    def options(self):
        return {**json.loads((ASSETS / 'editor.json').read_text(encoding='utf-8')),
                'instructions': (ASSETS / 'writing-prompts.md').read_text(encoding='utf-8').strip(),
                'descriptionTemplate': (ASSETS / 'description-template.txt').read_text(encoding='utf-8').strip()}

    def identifier(self, name):
        if not isinstance(name, str) or not name.strip() or len(name) > 120:
            raise ValueError('请填写120字以内的技能名称')
        from beivymate.configuration.skill_identifier import english_identifier
        base, message = english_identifier(name)
        used = {s['id'] for s in self.center.scan()['items']}
        identity, n = base, 2
        while identity in used or (self.center.custom / identity).exists():
            identity = f'{base}-{n}'; n += 1
        return {'id': identity, 'message': message}

    def check_identifier(self, identity, revision=None):
        if not isinstance(identity, str) or not IDENTIFIER.fullmatch(identity) or len(identity) > 64:
            return {'available': False, 'message': '唯一标识由小写字母、数字或连接符组成，最多64个字符。'}
        item = next((s for s in self.center.scan()['items'] if s['id'] == identity), None)
        if item is not None and revision is not None and item['revision'] != revision:
            return {'available': False, 'message': '技能内容已变化，请重新加载后核对。'}
        available = (item is None and not (self.center.custom / identity).exists()) or (
            item is not None and item['source'] != 'builtin' and revision is not None and item['revision'] == revision)
        return {'available': bool(available), 'message': '' if available else '唯一标识已被使用，请更换。'}

    def get(self, identity):
        entry, builtin = self.center._entry(identity)
        value = self.center.package(entry, builtin)
        if value.get('authoringFormat') != FORMAT:
            raise ValueError('该技能请使用原编辑入口')
        return value

    def save(self, owner, payload):
        value = Draft.model_validate(payload).model_dump()
        if not IDENTIFIER.fullmatch(value['id']):
            raise ValueError('唯一标识需由小写字母、数字和单个连接符组成，最多64个字符')
        if value['name'] != value['name'].strip():
            value['name'] = value['name'].strip()
        if not value['name'] or any(r not in ROLES for r in value['roles']) or len(set(value['roles'])) != len(value['roles']):
            raise ValueError('名称或适用角色无效')
        if 'common' in value['roles'] and len(value['roles']) > 1:
            raise ValueError('通用角色无需与其他角色同时选择')
        pref = value['modelPreference']
        if pref['mode'] not in ('inherit', 'specific') or (pref['mode'] == 'inherit' and pref['model']):
            raise ValueError('请选择默认模型或自定义模型')
        if value['revision'] is not None and self.get(value['id']).get('source') == 'builtin':
            raise PermissionError('内置技能只读')
        if value['revision'] is not None:
            self.get(value['id'])
        allowed = ('references/', 'assets/', 'scripts/', 'examples/')
        if any(not isinstance(f, dict) or not isinstance(f.get('path'), str) or not f['path'].startswith(allowed) for f in value['files']):
            raise ValueError('资源文件须放在参考资料、素材、脚本或示例目录中')
        return self.center.save(value['id'], dict(content=serialize_skill(value), files=value['files'],
                   state='draft', revision=value['revision'], authoringSettings=skill_settings(value)))

    def transition(self, owner, identity, action, revision):
        from beivymate.scheduling.locking import exclusive_file
        self.center.custom.mkdir(parents=True, exist_ok=True)
        with self.center.guard(identity), self.center.lock, exclusive_file(self.center.custom / '.skill-center.lock'):
            item = self.get(identity)
            if item['revision'] != revision:
                raise FileExistsError('技能内容已变化，请重新加载后核对')
            if item['state'] == 'published' and action == 'publish':
                return item
            if item['state'] == 'published' and action == 'validate':
                raise PermissionError('已启用技能不能重新检查，请先停用技能')
            if action in ('validate', 'publish'):
                # Snapshot selection checks credential/config availability, not an LLM call.
                errors = writing_errors(item)
                try:
                    self.catalog.snapshot(owner, purpose='skill', selection=item['modelPreference'], required=['text'])
                except (ValueError, RuntimeError, OSError) as exc:
                    errors.append(str(exc))
                if action == 'validate':
                    self.center.registry.validate('skill', identity, revision, errors)
                    return {**self.get(identity), 'validationWarnings': [
                        '结构检查不代表业务质量已验证，请确认资料要求、缺失处理、工作方法、输出和边界已说明。']}
                if errors:
                    self.center.registry.validate('skill', identity, revision, errors)
                    raise ValueError('发布前检查未通过：' + '；'.join(errors))
            if action == 'publish':
                self.center.registry.publish('skill', identity, revision)
            elif action == 'pause':
                self.center.registry.pause('skill', identity, revision)
            else:
                raise ValueError('不支持的技能状态操作')
            return self.get(identity)
