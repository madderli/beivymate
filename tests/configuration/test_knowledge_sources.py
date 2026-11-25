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


def test_grouped_library_persists_structure_and_path_checks(api, tmp_path):
    client, _, _ = api
    route = '/api/v1/knowledge-sources'
    readable = tmp_path / 'outpatient.md'
    readable.write_text('test case', encoding='utf-8')
    missing = tmp_path / 'hospital.md'
    additional = tmp_path / 'his.md'

    def file(path):
        return {'kind': 'file', 'storage': 'local', 'path': str(path)}

    groups = [
        {'name': 'CIS', 'children': [
            {'name': '门诊', 'paths': [file(readable)]},
            {'name': '住院', 'paths': [file(missing)]},
        ]},
    ]
    created = client.post(route, json={'name': '测试用例', 'groups': groups})
    assert created.status_code == 201, created.text
    source = created.json()
    url = f"{route}/{source['id']}"
    assert source['access']['accessible'] is None
    assert source['groups'][0]['children'] == groups[0]['children']
    assert [source['path'], *[path['path'] for path in source['additional']]] == [str(readable), str(missing)]

    checked = client.post(url + '/access').json()
    assert checked['accessible'] is False
    assert {item['path']: item['accessible'] for item in checked['results']} == {
        str(readable): True, str(missing): False,
    }
    assert client.get(route).json()['items'][0]['access'] == checked

    groups.append({'name': 'HIS', 'paths': [file(additional)]})
    updated = client.put(url, json={'name': '测试用例', 'groups': groups, 'revision': source['revision']})
    assert updated.status_code == 200, updated.text
    assert updated.json()['id'] == source['id']
    assert updated.json()['access']['results'] == checked['results']
    assert len(updated.json()['groups']) == 2
    assert client.post(route, json={'name': '重复资料', **file(additional)}).status_code == 409
    assert client.post(route, json={'name': '重复路径', 'groups': [
        {'name': '甲', 'paths': [file(additional)]},
        {'name': '乙', 'paths': [file(additional)]},
    ]}).status_code == 409
    assert client.post(route, json={'name': '超出三层', 'groups': [{'name': '甲', 'children': [
        {'name': '乙', 'paths': [file(additional)], 'children': [{'name': '丙', 'paths': [file(tmp_path / 'extra.md')]}]},
    ]}]}).status_code == 422

    workspace = client.post('/api/v1/workspaces', json={
        'shortName': 'QA', 'name': '测试交付', 'knowledgeDirectories': [str(missing)],
    })
    assert workspace.status_code == 201, workspace.text
    assert client.get(url + '/references').json()['items'] == [
        {'id': workspace.json()['id'], 'name': '测试交付', 'path': str(missing)},
    ]
