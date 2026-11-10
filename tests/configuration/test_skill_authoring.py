"""Real HTTP/persistence acceptance for creation, isolated from legacy import."""
import base64

import pytest
from fastapi.testclient import TestClient

from beivymate.application.web import create_app
from beivymate.configuration.skill_center import SkillCenter
from beivymate.configuration.skill_authoring import SkillAuthoring


class Vault:
    def get(self, *args): return None


@pytest.fixture
def api(tmp_path):
    app = create_app(tmp_path, 'setup', vault=Vault(), worker_enabled=False)
    with TestClient(app, base_url='http://127.0.0.1:8000', headers={'origin': 'http://127.0.0.1:5173'}) as c:
        c.post('/api/v1/account/initialize', json={'username':'creator','name':'编写者','password':'Secure-Password-123!','setupToken':'setup'})
        session=c.post('/api/v1/session',json={'username':'creator','password':'Secure-Password-123!'}).json()
        c.headers['x-csrf-token']=session['csrfToken']
        owner=session['user']['id']
        yield c,app,owner


def model(c, enabled=True):
    doc=c.get('/api/v1/models').json()
    doc['services']=[dict(id='local',name='本地厂商',protocol='ollama',endpoint='http://127.0.0.1:11434',auth='none',enabled=True,selfCert=False)]
    doc['models']=[dict(id='text-model',serviceId='local',identifier='local-text',name='本地文本模型',enabled=True,capabilities=['text'],orientation='均衡',currency='CNY')]
    doc['defaults']['general']='text-model'
    assert c.put('/api/v1/models',json=doc).status_code==200


def draft(**changes):
    return dict(id='meeting-notes',name='会议“纪要”',description='当用户提供会议记录时整理纪要。\n不编造决定。',roles=['common'],icon='📝',modelPreference={'mode':'inherit','model':'','capabilities':[]},body='# 会议纪要\n\n## 工作目标\n整理纪要。\n\n## 输入\n必需会议记录，缺失请求补充。\n\n## 方法\n提取决定，逐条核对原文。\n\n## 输出\n纪要包括行动项和依据。\n\n## 约束\n不编造内容。\n\n## 验收\n核对每项来源。',files=[],**changes)


def save(c, value=None):
    r=c.put('/api/v1/skill-authoring',json=value or draft())
    assert r.status_code==200,r.text
    return r.json()


def action(c,s,verb):
    return c.post('/api/v1/skill-authoring/'+s['id']+'/state',json={'action':verb,'revision':s['revision']})


def test_creation_roundtrip_resources_validation_publication_restart(api):
    c,app,owner=api
    options=c.get('/api/v1/skill-authoring/options').json()
    assert '输入' in options['instructions'] and len(options['directories'])==5
    assert c.get('/api/v1/skill-authoring/documents/guide').status_code==200
    assert '会议纪要' in c.get('/api/v1/skill-authoring/documents/example').text
    assert c.get('/api/v1/skill-authoring/documents/nope').status_code==404
    model(c)
    raw=b'\x00\xff\x80'+b'x'*300000
    value=draft();value['files']=[{'path':'assets/reference.bin','content':base64.b64encode(raw).decode(),'size':len(raw)}]
    s=save(c,value)
    assert s['state']=='draft' and s['body']==value['body']
    assert s['name']==value['name'] and s['description']==value['description']
    path=app.state.paths.skills/s['id']/'SKILL.md'
    header=path.read_text().split('---')[1]
    assert 'name: "meeting-notes"' in header and 'executor:' not in header and 'state:' not in header and 'metadata:' not in header
    assert not (path.parent/'contract.md').exists()
    assert (path.parent/'assets/reference.bin').read_bytes()==raw
    assert action(c,s,'publish').status_code==422
    checked=action(c,s,'validate');assert checked.status_code==200,checked.text
    assert checked.json()['state']=='validated'
    pub=action(c,s,'publish');assert pub.status_code==200,pub.text
    assert pub.json()['state']=='published'
    restarted=SkillCenter(app.state.paths.skills,registry=app.state.skill_center.registry)
    assert restarted.require_published(s['id'])['state']=='published'
    # Restart of the application-facing service observes the same local state.
    assert SkillAuthoring(restarted,app.state.model_catalog).get(s['id'])['state']=='published'
    assert c.put('/api/v1/skill-authoring', json={**value, 'revision': s['revision']}).status_code == 403
    assert action(c,s,'validate').status_code == 403
    s=action(c,s,'pause').json();assert s['state']=='paused'
    value.update(revision=s['revision'],body=value['body']+'\n补充检查。')
    changed=save(c,value);assert changed['state']=='draft' and changed['revision']!=s['revision']
    assert action(c,s,'publish').status_code==409
    assert action(c,changed,'publish').status_code==422


def test_drafts_without_model_or_complete_description_are_real_and_recoverable(api):
    c,app,owner=api
    v=draft();v.update(description='',body='',roles=[])
    s=save(c,v)
    assert c.get('/api/v1/skill-authoring/meeting-notes').json()['body']=='# 会议“纪要”'
    r=action(c,s,'validate').json()
    assert r['state']=='invalid' and r['validationErrors']
    assert action(c,s,'publish').status_code==422
    model(c)
    v=draft();v['revision']=s['revision'];s=save(c,v)
    assert action(c,s,'validate').json()['state']=='validated'


def test_initial_prompt_and_placeholder_cannot_publish_but_headings_examples_are_not_required(api):
    c,app,owner=api;model(c)
    v=draft();v['body']=c.get('/api/v1/skill-authoring/options').json()['instructions'];s=save(c,v)
    assert action(c,s,'validate').json()['state']=='invalid'
    v['body']='处理会议记录。\n……';v['revision']=s['revision'];s=save(c,v)
    assert action(c,s,'validate').json()['state']=='invalid'
    v['body']='阅读提供的会议记录，缺失时请求补充；整理决定和行动项，不补造责任人，交付前逐条核对来源。';v['revision']=s['revision'];s=save(c,v)
    assert action(c,s,'validate').json()['state']=='validated'


def test_identifier_collision_auth_csrf_and_malformed_requests(api):
    c,app,owner=api
    id=c.post('/api/v1/skill-authoring/identifier',json={'name':'会议纪要整理'}).json()['id']
    assert id=='meeting-notes-organization'
    assert c.post('/api/v1/skill-authoring/identifier',json={'name':'MeetingNotes'}).json()['id']=='meeting-notes'
    save(c)
    assert c.post('/api/v1/skill-authoring/identifier',json={'name':'MeetingNotes'}).json()['id']=='meeting-notes-2'
    assert c.put('/api/v1/skill-authoring',json=draft()).status_code==409
    v=draft();v['id']='bad_id';assert c.put('/api/v1/skill-authoring',json=v).status_code==422
    assert c.put('/api/v1/skill-authoring',json={**draft(),'unknown':True}).status_code==422
    assert c.put('/api/v1/skill-authoring',json=draft(),headers={'x-csrf-token':'wrong'}).status_code==403
    with TestClient(app,base_url='http://127.0.0.1:8000') as anon:
        assert anon.get('/api/v1/skill-authoring/options').status_code==401


@pytest.mark.parametrize('path',['../outside','assets/../../outside','assets\\bad','C:/bad','assets/.hidden','assets/SKILL.md','references/link:bad'])
def test_bad_paths_cannot_leave_partial_packages(api,path):
    c,app,owner=api;v=draft();v['files']=[{'path':path,'text':'x'}]
    assert c.put('/api/v1/skill-authoring',json=v).status_code==422
    assert not (app.state.paths.skills/'meeting-notes').exists()


def test_external_edits_invalidate_and_do_not_overwrite(api):
    c,app,owner=api;model(c);s=save(c)
    assert action(c,s,'validate').json()['state']=='validated'
    assert action(c,s,'publish').json()['state']=='published'
    entry=app.state.paths.skills/s['id']/'SKILL.md'
    entry.write_text(entry.read_text()+'\nexternal edit')
    assert c.get('/api/v1/skill-authoring/'+s['id']).json()['state']=='draft'
    assert action(c,s,'publish').status_code==409
    v=draft();v['revision']=s['revision']
    assert c.put('/api/v1/skill-authoring',json=v).status_code==409
    assert entry.read_text().endswith('external edit')


def test_legacy_state_endpoint_cannot_bypass_current_model_check(api):
    c,app,owner=api;model(c);s=save(c)
    assert action(c,s,'validate').json()['state']=='validated'
    doc=c.get('/api/v1/models').json();doc['services'][0]['enabled']=False;doc['defaults']['general']=''
    doc['services']=[{k:v for k,v in row.items() if k not in ('configured','credentialError')} for row in doc['services']]
    assert c.put('/api/v1/models',json=doc).status_code==200
    r=c.post('/api/v1/skill-center/'+s['id']+'/state',json={'action':'publish','revision':s['revision']})
    assert r.status_code==422


def test_unclosed_task_locks_new_package_even_after_run_completed(api):
    c,app,owner=api;model(c);s=save(c)
    assert c.post('/api/v1/workspaces',json={'id':'WS','name':'工作区','knowledge':'资料','project':'项目'}).status_code==201
    task=c.post('/api/v1/tasks',data={'title':'任务','workspace':'WS','workflow':'uat','description':'需求','version':'1','environment':'uat','locale':'zh-CN','relatedWorkspaces':'[]'},files=[('attachments',('需求.md','业务资料'.encode(),'text/markdown'))],headers={'idempotency-key':'skill-lock-test'})
    assert task.status_code==201,task.text
    tid=task.json()['id']
    with app.state.portal.db() as db:
        db.execute('INSERT OR IGNORE INTO resource_reference VALUES (?,?,?)',(tid,'skill',s['id']))
        db.execute("UPDATE entity SET status='completed' WHERE id=?",(tid,))
    value=draft();value['revision']=s['revision']
    assert c.put('/api/v1/skill-authoring',json=value).status_code==409
    for verb in ['validate','publish','pause']:
        assert action(c,s,verb).status_code==409
    current=next(t for t in c.get('/api/v1/workbench').json()['tasks'] if t['id']==tid)
    closed=c.post('/api/v1/tasks/'+tid+'/actions',json={'action':'close','expectedRevision':current['revision']},headers={'idempotency-key':'close-skill-lock'})
    assert closed.status_code==200,closed.text
    assert c.put('/api/v1/skill-authoring',json=value).status_code==200


def test_missing_resource_reference_and_text_model_requirements(api):
    c,app,owner=api;model(c)
    v=draft();v['body']+='\n请参考[规范](references/rules.md)。'
    s=save(c,v)
    checked=action(c,s,'validate').json()
    assert checked['state']=='invalid' and any('rules.md' in e for e in checked['validationErrors'])
    v['files']=[{'path':'references/rules.md','text':'不编造决定。'}];v['revision']=s['revision'];s=save(c,v)
    assert action(c,s,'validate').json()['state']=='validated'
    refs=app.state.model_catalog.maintenance.references(owner)
    ref=next(r for r in refs if r['id']=='skill:'+s['id'])
    assert 'text' in ref['required']


def test_quoted_description_delimiters_and_corrupt_external_metadata(api):
    c,app,owner=api
    v=draft();v['description']='处理包含---分隔符和“引号”的输入。';s=save(c,v)
    assert s['description']==v['description']
    entry=app.state.paths.skills/s['id']/'SKILL.md'
    # Directly prepare malformed application metadata; scanning must report, not crash.
    import json
    settings=entry.parent/'.beivymate.json'
    extra=json.loads(settings.read_text());extra['beivymate-roles']='null'
    settings.write_text(json.dumps(extra))
    response=c.get('/api/v1/skill-center')
    assert response.status_code==200 and response.json()['errors']


def test_help_documents_keep_prototype_content_and_downloads(api):
    c,app,owner=api
    from pathlib import Path
    import re
    prototype=Path(__file__).resolve().parents[2]/'prototypes'
    source=(prototype/'new-skill-demo.html').read_text()
    description=re.search(r'id="description-help"[\s\S]*?<div class="help-content">(.*?)</div>',source,re.S).group(1)
    options=c.get('/api/v1/skill-authoring/options').json()
    assert options['help']['description']['html']==description
    for name in ('guide','example'):
        md=c.get('/api/v1/skill-authoring/documents/'+name+'.md')
        assert md.status_code==200
        assert 'attachment;' in md.headers['content-disposition']
        assert md.text==(prototype/f'skill-writing-{name}.md').read_text()
        page=c.get('/api/v1/skill-authoring/documents/'+name)
        assert '下载 Markdown' in page.text and 'data-return-editor' in page.text
        assert 'new-skill-demo.html' not in page.text
    js=c.get('/api/v1/skill-authoring/documents/navigation.js')
    assert js.status_code==200 and 'window.close()' in js.text
    assert c.get('/api/v1/skill-authoring/documents/../editor.json').status_code!=200


def test_clean_skill_config_fingerprint_legacy_conversion_and_model_replacement(api):
    c,app,owner=api;model(c);s=save(c)
    from beivymate.configuration.skill_authoring import skill_settings
    import json
    entry=app.state.paths.skills/s['id']/'SKILL.md';settings=entry.parent/'.beivymate.json'
    assert settings.exists() and all(not f['path'].startswith('.') for f in s['files'])
    assert c.post('/api/v1/skill-authoring/identifier',json={'name':'需求理解'}).json()['id']=='requirement-understanding'
    # Older packages remain readable; only an explicit save converts their storage.
    extra=skill_settings(draft());settings.unlink()
    entry.write_text(entry.read_text().replace('---\n\n','metadata: '+json.dumps(extra,ensure_ascii=False)+'\n---\n\n'))
    old=c.get('/api/v1/skill-authoring/'+s['id']).json();assert old['name']==s['name']
    value=draft();value['revision']=old['revision'];s=save(c,value)
    assert 'metadata:' not in entry.read_text() and settings.exists()
    assert action(c,s,'validate').json()['state']=='validated'
    assert action(c,s,'publish').json()['state']=='published'
    settings.write_text(settings.read_text()+'\n')
    changed=c.get('/api/v1/skill-authoring/'+s['id']).json()
    assert changed['state']=='draft' and changed['revision']!=s['revision']
    doc=c.get('/api/v1/models').json();doc['services']=[{k:v for k,v in row.items() if k not in ('configured','credentialError')} for row in doc['services']]
    target={**doc['models'][0],'id':'second-model','name':'第二模型','identifier':'second-text'};target.pop('unavailableReason',None);doc['models'].append(target)
    assert c.put('/api/v1/models',json=doc).status_code==200
    catalog=app.state.model_catalog;definition=catalog._read(owner)[0].models[-1]
    plan=catalog.maintenance.preview(owner,'text-model',definition)
    before=entry.read_bytes()
    catalog.maintenance.apply(owner,'text-model',{'revision':plan['revision'],'selected':['skill:'+s['id']]},definition)
    latest=c.get('/api/v1/skill-authoring/'+s['id']).json()
    assert latest['modelPreference']['model']=='second-model' and latest['state']=='draft'
    assert entry.read_bytes()==before and 'metadata:' not in entry.read_text()


def test_identifier_preflight_and_h1_title(api):
    c,app,owner=api
    path='/api/v1/skill-authoring/identifier/check'
    assert c.post(path,json={'id':'meeting-notes'}).json()['available']
    assert not c.post(path,json={'id':'bad_id'}).json()['available']
    assert not c.post(path,json={'id':'test_analysis'}).json()['available']
    v=draft();v['body']='处理资料并输出结果。';s=save(c,v)
    assert s['body'].startswith('# '+v['name']+'\n\n')
    assert not c.post(path,json={'id':s['id']}).json()['available']
    assert c.post(path,json={'id':s['id'],'revision':s['revision']}).json()['available']
    assert c.put('/api/v1/skill-authoring',json=v).status_code==409
    entry=app.state.paths.skills/s['id']/'SKILL.md'
    assert '# '+v['name'] in entry.read_text()
    model(c);v['body']='# 只有标题';v['revision']=s['revision'];s=save(c,v)
    assert action(c,s,'validate').json()['state']=='invalid'


def test_english_identifier_generation_collision_and_existing_packages(api):
    c, app, owner = api
    endpoint = '/api/v1/skill-authoring/identifier'
    assert c.post(endpoint, json={'name': '测试分析'}).json()['id'] == 'test-analysis'
    assert c.post(endpoint, json={'name': '测试理解（测试）'}).json()['id'] == 'test-understanding-test'
    value = draft()
    value['id'] = 'test-analysis'
    saved = save(c, value)
    assert c.post(endpoint, json={'name': '测试分析'}).json()['id'] == 'test-analysis-2'
    old = draft()
    old['id'] = 'ce-shi-fen-xi'
    old['name'] = '原有技能'
    save(c, old)
    assert c.get('/api/v1/skill-authoring/ce-shi-fen-xi').json()['id'] == 'ce-shi-fen-xi'
    assert c.get('/api/v1/skill-authoring/test-analysis').json()['revision'] == saved['revision']
    result = c.post(endpoint, json={'name': '苜蓿斑鸠'}).json()
    assert result['id'].startswith('custom-skill-') and result['message']
    assert 'identifierTerms' not in c.get('/api/v1/skill-authoring/options').json()


def test_editable_description_template_cannot_be_published_as_real_content(api):
    c, app, owner = api
    model(c)
    template = c.get('/api/v1/skill-authoring/options').json()['descriptionTemplate']
    assert template.startswith('用于【任务】，输出【主要成果】。')
    assert template.endswith('存在冲突或未经确认的推断时【处理规则】。')
    value = draft()
    value['description'] = template
    saved = save(c, value)
    result = action(c, saved, 'validate').json()
    assert result['state'] == 'invalid'
    assert any('技能描述' in error and '实际内容' in error for error in result['validationErrors'])
    value['revision'] = saved['revision']
    value['description'] = '用于整理会议记录，输出会议纪要。缺少记录时请用户补充，不编造决定。'
    changed = save(c, value)
    assert action(c, changed, 'validate').json()['state'] == 'validated'
    assert c.get('/api/v1/skill-authoring/meeting-notes').json()['description'] == value['description']
