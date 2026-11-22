"""Knowledge entries persist locally and access checks follow the actual path."""
from tests.configuration.test_skill_authoring import api


def test_source_registry_and_live_access(api, tmp_path):
    client, _, _ = api
    route = '/api/v1/knowledge-sources'
    document = tmp_path / 'requirements.md'
    draft = {'name': '项目需求', 'kind': 'file', 'storage': 'shared', 'path': str(document)}
    assert client.get(route).json() == {'items': []}
    assert client.post(route, json={**draft, 'path': 'relative.md'}).status_code == 422
    response = client.post(route, json=draft)
    assert response.status_code == 201, response.text
    entry = response.json()
    url = route + '/' + entry['id']
    assert client.get(route).json()['items'] == [entry]
    assert client.post(route, json=draft).status_code == 409
    assert client.post(url + '/access').json()['accessible'] is False
    document.write_text('需求', encoding='utf-8')
    assert client.post(url + '/access').json()['accessible'] is True
    assert client.put(url, json={**draft, 'revision': 0}).status_code == 409
    updated = client.put(url, json={**draft, 'revision': entry['revision'], 'kind': 'directory'})
    assert updated.status_code == 200, updated.text
    assert client.post(url + '/access').json()['accessible'] is False
    assert client.get(url + '/references').json() == {'items': []}
    client.cookies.clear()
    assert client.get(route).status_code == 401


def test_system_picker_and_save_multiple_paths(api, tmp_path, monkeypatch):
    client, _, _ = api
    route = '/api/v1/knowledge-sources'
    library = tmp_path / 'library'
    library.mkdir()
    directory = library / 'project'
    directory.mkdir()
    document = library / 'requirements.md'
    document.write_text('需求', encoding='utf-8')
    from beivymate.application import knowledge_sources

    monkeypatch.setattr(knowledge_sources, 'select_path', lambda kind: str(directory) if kind == 'directory' else None)
    assert client.post(route + '/pick-path', json={'kind': 'directory'}).json() == {'path': str(directory)}
    assert client.post(route + '/pick-path', json={'kind': 'file'}).json() == {'path': None}
    assert client.post(route + '/pick-path', json={'kind': 'other'}).status_code == 422
    file_entry = {'kind': 'file', 'storage': 'local', 'path': str(document)}
    draft = {'name': '项目资料', 'kind': 'directory', 'storage': 'local',
             'path': str(directory), 'additional': [file_entry]}
    assert client.post(route, json={**draft, 'additional': [file_entry, file_entry]}).status_code == 409
    created = client.post(route, json=draft)
    assert created.status_code == 201, created.text
    entry = created.json()
    assert client.get(route).json()['items'] == [entry]
    assert entry['additional'] == [file_entry]
    assert client.post(route, json={'name': '重复资料', **file_entry}).status_code == 409
    access_url = route + '/' + entry['id'] + '/access'
    assert client.post(access_url).json()['accessible']
    document.unlink()
    checked = client.post(access_url).json()
    assert not checked['accessible']
    assert [failure['path'] for failure in checked['failures']] == [str(document)]
    client.cookies.clear()
    assert client.post(route + '/pick-path', json={'kind': 'directory'}).status_code == 401
