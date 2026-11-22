import sys,tempfile
from pathlib import Path
sys.path.insert(0,str(Path.cwd()))
from fastapi.testclient import TestClient
from beivymate.application.web import create_app
from tests.configuration.test_skill_authoring import Vault,model,draft
root=Path(tempfile.mkdtemp(prefix='workflow-acceptance-'))
app=create_app(root,'workflow-test',vault=Vault(),worker_enabled=False,origins=['http://127.0.0.1:4175','http://127.0.0.1:8002'])
with TestClient(app,base_url='http://127.0.0.1:8002',headers={'origin':'http://127.0.0.1:4175'}) as c:
 c.post('/api/v1/account/initialize',json={'username':'workflow-review','name':'工作流验收','password':'Review-Password-123!','setupToken':'workflow-test'})
 login=c.post('/api/v1/session',json={'username':'workflow-review','password':'Review-Password-123!'}).json()
 c.headers['x-csrf-token']=login['csrfToken']
 model(c)
 item=c.put('/api/v1/skill-authoring',json=draft()).json()
 for action in ['validate','publish']:
  item=c.post('/api/v1/skill-authoring/meeting-notes/state',json={'action':action,'revision':item['revision']}).json()
 assert item['state']=='published',item
import uvicorn
uvicorn.run(app,host='127.0.0.1',port=8002,access_log=False)
