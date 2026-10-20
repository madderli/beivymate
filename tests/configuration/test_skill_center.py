import base64
from pathlib import Path
import pytest
from beivymate.configuration.skill_center import SkillCenter, BUILTIN_SKILLS
from beivymate.configuration.skill_package import SkillCatalog


def content(identity='notes'):
    return f'---\nid: {identity}\nname: Notes\ndescription: Summarize notes\nrole: common\nversion: "1"\nroles: ["common"]\nmodel_preference: {{"tier":"balanced"}}\n---\n\n# Instructions\nRead the supplied notes.'


def test_discover_copied_package_and_refresh(tmp_path):
    center = SkillCenter(tmp_path)
    assert len(center.scan()['items']) == 5
    folder = tmp_path / 'external'; folder.mkdir()
    (folder / 'SKILL.md').write_text('---\nname: External\ndescription: Imported package\n---\nRead the input.')
    item = next(s for s in center.scan()['items'] if s['id'] == 'external')
    assert item['role'] == 'common' and item['source'] == 'custom'
    (folder / 'SKILL.md').write_text('---\nname: Updated\ndescription: Imported package\n---\nRead the input.')
    assert next(s for s in center.scan()['items'] if s['id'] == 'external')['name'] == 'Updated'


def test_save_restart_binary_and_external_revision_conflict(tmp_path):
    center = SkillCenter(tmp_path)
    raw = b'\x00\xff\x80binary'
    body = dict(content=content(), state='draft', files=[{'path':'templates/test.xlsx','content':base64.b64encode(raw).decode()}])
    saved = center.save('notes', body)
    assert (tmp_path / 'notes/templates/test.xlsx').read_bytes() == raw
    reloaded = next(s for s in SkillCenter(tmp_path).scan()['items'] if s['id'] == 'notes')
    assert reloaded['state'] == 'draft' and reloaded['roles'] == ['common']
    assert reloaded['revision'] == saved['revision']
    (tmp_path/'notes/SKILL.md').write_text(content()+'\nexternal edit')
    with pytest.raises(FileExistsError):
        center.save('notes', {**body, 'revision':saved['revision']})
    assert 'external edit' in (tmp_path/'notes/SKILL.md').read_text()


@pytest.mark.parametrize('name', ['../outside', '/absolute', 'assets/../../outside', 'assets\\bad', '.secret', 'assets/SKILL.md'])
def test_reject_unsafe_or_nested_package_paths(tmp_path, name):
    center = SkillCenter(tmp_path)
    with pytest.raises(ValueError):
        center.save('notes', dict(content=content(), state='draft', files=[dict(path=name,text='x')]))
    assert not (tmp_path/'notes').exists()


def test_builtin_readonly_and_duplicate_error(tmp_path):
    center = SkillCenter(tmp_path)
    with pytest.raises(PermissionError):
        center.save('test_analysis', dict(content=content('test_analysis'),state='published',files=[]))
    folder = tmp_path/'duplicate'; folder.mkdir()
    (folder/'SKILL.md').write_text(content('test_analysis'))
    result = center.scan()
    assert len(result['items']) == 5 and '重复' in result['errors'][0]['message']


def test_symlink_and_bad_package_do_not_hide_valid_packages(tmp_path):
    bad = tmp_path/'bad'; bad.mkdir(); (bad/'SKILL.md').write_text('invalid')
    linked = tmp_path/'linked'; linked.mkdir(); (linked/'SKILL.md').symlink_to(BUILTIN_SKILLS/'tester/test_analysis/SKILL.md')
    result = SkillCenter(tmp_path).scan()
    assert len(result['items']) == 5 and len(result['errors']) == 2


def test_fork_keeps_runtime_contract_and_templates(tmp_path):
    center = SkillCenter(tmp_path)
    original = next(s for s in center.scan()['items'] if s['id']=='test_analysis')
    # Equivalent to the UI: display metadata plus the original executable metadata.
    text = content('custom_analysis').replace('role: common', 'role: tester').replace('["common"]', '["tester"]').split('---\n\n')[0] + '\n' + original['extraFrontmatter'] + '\n---\n\n' + original['body']
    center.save('custom_analysis', dict(content=text,state='published',files=original['files']))
    spec = SkillCatalog(BUILTIN_SKILLS,tmp_path).get('custom_analysis')
    assert spec.executor == 'test_analysis'
    saved = next(s for s in center.scan()['items'] if s['id']=='custom_analysis')
    center.save('custom_analysis',dict(content=text,state='paused',files=saved['files'],revision=saved['revision']))
    with pytest.raises(ValueError,match='停用'):
        SkillCatalog(BUILTIN_SKILLS,tmp_path).get('custom_analysis')
