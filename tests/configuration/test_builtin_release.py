"""Shipping defaults stay empty until a tested package is explicitly promoted."""
import json
from pathlib import Path

from fastapi.testclient import TestClient

from beivymate.application.web import create_app
from beivymate.configuration.library import ConfigurationLibrary
from beivymate.configuration.skill_center import BUILTIN_SKILLS, SkillCenter
from beivymate.configuration.skill_package import SkillCatalog

ROOT = Path(__file__).resolve().parents[2]


def test_release_has_no_legacy_builtin_packages_or_manifest_entries(tmp_path):
    assert not list(BUILTIN_SKILLS.rglob('SKILL.md'))
    assert SkillCenter(tmp_path / 'skills').scan() == {'items': [], 'errors': []}
    assert ConfigurationLibrary(ROOT / 'resources', tmp_path).list('skills') == []
    assert SkillCatalog(BUILTIN_SKILLS).entries == {}
    manifest = json.loads((ROOT / 'resources/builtin-manifest.json').read_text())
    assert not any(key.startswith('skills/') for key in manifest)


def test_default_app_keeps_custom_skills_without_reintroducing_old_builtins(tmp_path):
    folder = tmp_path / 'skills/my-notes'
    folder.mkdir(parents=True)
    original = '---\nname: my-notes\ndescription: Summarize meeting notes\n---\nSummarize supplied notes without inventing decisions.\n'
    (folder / 'SKILL.md').write_text(original)
    app = create_app(tmp_path, 'setup', worker_enabled=False)
    items = app.state.skill_center.scan()['items']
    assert [(item['id'], item['source']) for item in items] == [('my-notes', 'custom')]
    assert (folder / 'SKILL.md').read_text() == original
    assert app.state.configuration_library.list('skills') == []


def test_skill_center_http_starts_empty_in_default_installation(tmp_path):
    app = create_app(tmp_path, 'setup', worker_enabled=False)
    with TestClient(app, base_url='http://127.0.0.1:8000', headers={'origin': 'http://127.0.0.1:5173'}) as client:
        assert client.post('/api/v1/account/initialize', json={
            'username': 'tester', 'name': '测试员', 'password': 'Secure-Password-123!', 'setupToken': 'setup',
        }).status_code == 201
        assert client.post('/api/v1/session', json={
            'username': 'tester', 'password': 'Secure-Password-123!',
        }).status_code == 200
        assert client.get('/api/v1/skill-center').json()['items'] == []
        assert client.get('/api/v1/configuration/skills').json()['items'] == []
