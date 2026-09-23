from fastapi.testclient import TestClient
from beivymate.application.web import create_app
from beivymate.documents.models import DocumentOrigin,OutputPolicy


def test_authenticated_document_edits_and_template_conflicts(tmp_path):
    app=create_app(tmp_path,'setup')
    with TestClient(app,base_url='http://127.0.0.1:8000',headers={'origin':'http://127.0.0.1:5173'}) as c:
        assert c.get('/api/v1/documents').status_code==401
        c.post('/api/v1/account/initialize',json={'username':'tester','password':'Secure-Password-123!','name':'测试人员','setupToken':'setup'})
        session=c.post('/api/v1/session',json={'username':'tester','password':'Secure-Password-123!'}).json()
        c.headers['x-csrf-token']=session['csrfToken'];owner=session['user']['id']
        origin=DocumentOrigin(workspace='w',task='t',run='r',step='s',skill='requirement_understand',responsible=owner,executor='agent:tester')
        ref=app.state.documents.create(owner,OutputPolicy(id='out',filename='requirement_understand.md'),origin,b'original')
        assert len(c.get('/api/v1/documents').json()['items'])==1
        download=c.get(f'/api/v1/documents/{ref.id}/content',params={'revision':ref.revision,'sha256':ref.sha256})
        assert download.content==b'original'
        assert 'requirement_understand.md' in download.headers['content-disposition']
        result=c.post('/api/v1/documents/actions',json={'action':'edit','ref':ref.model_dump(),'content':'updated'})
        assert result.status_code==200,result.text
        assert c.post('/api/v1/documents/actions',json={'action':'edit','ref':ref.model_dump(),'content':'lost update'}).status_code==409
        assert len(c.get(f'/api/v1/documents/{ref.id}/history').json()['items'])==2
        templates=c.get('/api/v1/configuration/skills/test_analysis/templates').json()['items'];template=templates[0]
        body={key:template[key] for key in ('name','revision','content')}
        assert c.put('/api/v1/configuration/skills/test_analysis/templates',json=body).status_code==403
        skill=next(i for i in c.get('/api/v1/configuration/skills').json()['items'] if i['id']=='test_analysis')
        response=c.put('/api/v1/configuration/skills/custom_analysis',json={'content':skill['content'].replace('id: test_analysis','id: custom_analysis'),'copyFrom':'test_analysis'})
        assert response.status_code==200,response.text
        assert c.put('/api/v1/configuration/skills/custom_analysis/templates',json=body).status_code==200
        from pathlib import Path
        copied=c.get('/api/v1/configuration/skills/custom_analysis/templates').json()['items'][0]
        Path(copied['path']).write_text(Path(copied['path']).read_text()+'\nmanual edit')
        assert c.put('/api/v1/configuration/skills/custom_analysis/templates',json=body).status_code==409

        published_ref=app.state.documents.create(owner,OutputPolicy(id='published',filename='published.md',asset=True),origin,b'published text')
        app.state.documents.confirm(owner,published_ref,owner)
        published_path=Path(app.state.documents.publish_asset(owner,published_ref,owner))
        published_path.write_bytes(b'customer modification')
        item=next(i for i in c.get('/api/v1/documents').json()['items'] if i['ref']['id']==published_ref.id)
        assert item['published_file_changed'] and item['publications'][0]['status']=='changed'
        recovery=c.post('/api/v1/documents/actions',json={'action':'restore-publication','ref':published_ref.model_dump()})
        assert recovery.status_code==200,recovery.text
        assert Path(recovery.json()['backup']).read_bytes()==b'customer modification'
        assert published_path.read_bytes()==b'published text'
