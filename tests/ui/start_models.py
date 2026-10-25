"""Real application + isolated HTTP model fixture; never touches user data or credentials."""
import json
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import uvicorn
from beivymate.application.web import create_app


class Vault:
    def __init__(self): self.items={}
    def get(self,owner,connection): return self.items.get((owner,connection))
    def save(self,owner,connection,secret): self.items[owner,connection]=secret
    def delete(self,owner,connection): self.items.pop((owner,connection),None)


class ModelHandler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def send_json(self,status,data):
        raw=json.dumps(data).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
    def do_GET(self):
        if self.headers.get('Authorization')!='Bearer fixture-secret':
            self.send_json(401,{'error':'incorrect key'});return
        if self.path=='/v1/models': self.send_json(200,{'data':[{'id':'fixture-a'},{'id':'fixture-b'}]})
        else:self.send_json(404,{})
    def do_POST(self):
        payload=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        if self.headers.get('Authorization')!='Bearer fixture-secret':
            self.send_json(401,{'error':'incorrect key'});return
        schema=payload.get('response_format',{}).get('json_schema',{}).get('schema')
        if schema:
            data={name: {'status':'not_provided','reason':'离线 HTTP 模型：输入未提供该信息'} for name in schema.get('properties',{}) if name!='unknowns'}
            data['unknowns']=[];content=json.dumps(data,ensure_ascii=False)
        else:content='HTTP 模型回复：'+payload['model']
        self.send_json(200,{'model':payload['model'],'choices':[{'finish_reason':'stop','message':{'content':content}}],'usage':{'prompt_tokens':10,'completion_tokens':5}})


if __name__=='__main__':
    model=ThreadingHTTPServer(('127.0.0.1',8002),ModelHandler)
    threading.Thread(target=model.serve_forever,daemon=True).start()
    try:
        with tempfile.TemporaryDirectory(prefix='beivymate-model-ui-') as directory:
            uvicorn.run(create_app(Path(directory),'browser-test-initialization',vault=Vault()),host='127.0.0.1',port=8001,access_log=False)
    finally:model.shutdown();model.server_close()
