import shutil
from pathlib import Path

import pytest

from beivymate.foundation.paths import AppPaths
from beivymate.foundation.resources import ResourceRegistry
from beivymate.configuration.skill_center import SkillCenter, BUILTIN_SKILLS


def copy_skill(root, identity='shared_analysis'):
    target = root / identity
    shutil.copytree(BUILTIN_SKILLS/'tester/test_analysis', target)
    entry = target/'SKILL.md'
    entry.write_text(entry.read_text().replace('id: test_analysis', 'id: '+identity))
    return entry


def test_shared_package_requires_local_validation_and_publication(tmp_path):
    a, b = tmp_path/'a', tmp_path/'b'
    entry = copy_skill(a)
    center = SkillCenter(a)
    item = next(s for s in center.scan()['items'] if s['id']=='shared_analysis')
    assert item['state'] == 'discovered'
    with pytest.raises(ValueError, match='验证'):
        center.transition(item['id'], 'publish', item['revision'])
    assert center.transition(item['id'], 'validate', item['revision'])['state'] == 'validated'
    assert center.transition(item['id'], 'publish', item['revision'])['state'] == 'published'
    assert SkillCenter(a).require_published(item['id'])['state'] == 'published'
    shutil.copytree(entry.parent, b/'shared_analysis')
    receiver = SkillCenter(b)
    assert next(s for s in receiver.scan()['items'] if s['id']==item['id'])['state'] == 'discovered'
    with pytest.raises(ValueError, match='发布'):
        receiver.require_published(item['id'])
    # A template edit invalidates publication even when SKILL.md is unchanged.
    template = next((entry.parent/'templates').rglob('*.md'))
    template.write_text(template.read_text()+'\nExternal edit')
    assert next(s for s in center.scan()['items'] if s['id']==item['id'])['state']=='discovered'
    with pytest.raises(FileExistsError):
        center.transition(item['id'], 'publish', item['revision'])


def test_import_never_inherits_declared_published_state(tmp_path):
    source = tmp_path/'source'
    entry = copy_skill(source)
    source_center = SkillCenter(source)
    original = next(s for s in source_center.scan()['items'] if s['id']=='shared_analysis')
    target = SkillCenter(tmp_path/'receiver')
    saved = target.save('shared_analysis', {'content':entry.read_text()+'\n', 'files':original['files'], 'state':'published', 'imported':True})
    assert saved['state']=='discovered'


def test_failed_validation_cannot_publish_and_validated_revision_is_exact(tmp_path):
    root = tmp_path/'skills'; root.mkdir()
    package = root/'generic'; package.mkdir()
    (package/'SKILL.md').write_text('---\nname: Generic\ndescription: Only instructions\nstate: published\n---\nRead input.')
    center = SkillCenter(root)
    item = next(s for s in center.scan()['items'] if s['id']=='generic')
    result = center.transition('generic','validate',item['revision'])
    assert result['state']=='invalid' and result['validationErrors']
    with pytest.raises(ValueError):
        center.transition('generic','publish',item['revision'])
    registry = ResourceRegistry(tmp_path/'state.sqlite3')
    registry.validate('workflow','flow','r1',[])
    registry.observe('workflow','flow','r2')
    with pytest.raises(ValueError):
        registry.publish('workflow','flow','r1')


def test_paths_and_non_destructive_migration(tmp_path, monkeypatch):
    monkeypatch.setenv('BEIVYMATE_DATA_DIR',str(tmp_path/'user'))
    from beivymate.documents.defaults import data_directory
    assert data_directory()==tmp_path/'user'
    paths = AppPaths(data_directory())
    assert paths.skills == tmp_path/'user/skills'
    assert paths.builtin == BUILTIN_SKILLS.parent
    source = paths.root/'configuration/skills'
    entry = copy_skill(source)
    assert paths.migrate_skills()
    assert entry.exists() and (paths.skills/'shared_analysis/SKILL.md').exists()
    (paths.skills/'shared_analysis/SKILL.md').write_text('user modified target')
    assert any('冲突' in message for message in paths.migrate_skills())
    assert (paths.skills/'shared_analysis/SKILL.md').read_text()=='user modified target'
    assert entry.exists()
