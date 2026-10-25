"""On-demand provider facts, bounded previews and local retirement evidence."""
from datetime import date, datetime, timezone
import hashlib
import json
import sqlite3
import time
import uuid
from threading import RLock
from beivymate.models.schema import Model


def now():
    return datetime.now(timezone.utc).isoformat()


class ModelLifecycle:
    def __init__(self, catalog, conversations):
        self.catalog, self.conversations = catalog, conversations
        self.path = catalog.root / 'work/model-lifecycle.sqlite3'
        self.lock = RLock()
        self.sessions = {}
        with self.db() as db:
            db.execute('CREATE TABLE IF NOT EXISTS facts(owner TEXT,id TEXT,data TEXT,PRIMARY KEY(owner,id))')
        self.path.chmod(0o600)

    def db(self):
        return sqlite3.connect(self.path, timeout=15)

    def facts(self, owner):
        with self.db() as db:
            values={row[0]:json.loads(row[1]) for row in db.execute('SELECT id,data FROM facts WHERE owner=?',(owner,))}
        doc,_=self.catalog._read(owner)
        for model in doc.models:
            service=next(s for s in doc.services if s.id==model.serviceId)
            expected=service.endpoint+('/api/tags' if service.protocol=='ollama' else '/models')
            if model.id in values and values[model.id].get('source')!=expected:
                values[model.id]={**values[model.id],'status':'unknown','shutdownDate':None,'versionStatus':'unknown','latestModel':None,'message':'连接配置已变化，请重新检查'}
        return values

    def retired(self, owner, identity):
        value=self.facts(owner).get(identity,{})
        return self._expired(value.get('shutdownDate'))

    @staticmethod
    def _expired(value):
        return bool(value and date.fromisoformat(value) <= datetime.now().astimezone().date())

    def directory(self, owner, service):
        return self.catalog.directory_entries(owner, service)

    @staticmethod
    def evidence(entry, url):
        # Optional public-provider fields only; never infer prices/capabilities from an ID.
        shutdown = entry.get('shutdown_date')
        if shutdown is not None:
            try: shutdown = date.fromisoformat(shutdown).isoformat()
            except (TypeError, ValueError): shutdown = None
        return {'shutdownDate': shutdown, 'source': url, 'checkedAt': now()}

    @staticmethod
    def version_evidence(entry, identity, indexed):
        # Optional provider extensions, not inferred from model names or dates.
        if not entry:
            return {'versionStatus': 'unknown', 'latestModel': None}
        if 'is_latest' in entry and type(entry['is_latest']) is not bool:
            return {'versionStatus': 'unknown', 'latestModel': None}
        if 'latest_model_id' in entry and (not isinstance(entry['latest_model_id'], str) or not entry['latest_model_id'].strip()):
            return {'versionStatus': 'unknown', 'latestModel': None}
        latest = entry.get('latest_model_id')
        latest = latest.strip() if isinstance(latest, str) else None
        flag = entry.get('is_latest')
        if latest and latest != identity and latest in indexed and flag is not True:
            return {'versionStatus': 'update_available', 'latestModel': latest}
        if (latest == identity and flag is not False) or (flag is True and not latest):
            return {'versionStatus': 'latest', 'latestModel': identity}
        return {'versionStatus': 'unknown', 'latestModel': None}

    def check(self, owner, identities=None, used_only=False):
        doc, _ = self.catalog._read(owner)
        if identities is not None and (not isinstance(identities, list) or any(not isinstance(i, str) for i in identities)):
            raise ValueError('检查模型列表格式不正确')
        references = self.catalog.maintenance.references(owner)
        used = {item['model'] for item in references}
        selected = [m for m in doc.models if (identities is None or m.id in identities) and (not used_only or m.id in used)]
        errors = []
        for service in doc.services:
            models = [m for m in selected if m.serviceId == service.id]
            if not models: continue
            try:
                entries = self.directory(owner, service)
                indexed = {identity:e for e in entries if isinstance(e,dict) for identity in [e.get('id') if service.protocol!='ollama' else e.get('name')] if isinstance(identity,str)}
                with self.db() as db:
                    for model in models:
                        entry = indexed.get(model.identifier)
                        previous = db.execute('SELECT data FROM facts WHERE owner=? AND id=?', (owner, model.id)).fetchone()
                        old = json.loads(previous[0]) if previous else {}
                        if entry is None:
                            fact = {**(old if old.get('source')==service.endpoint+('/api/tags' if service.protocol=='ollama' else '/models') else {}), 'checkedAt': now(), 'source':service.endpoint+('/api/tags' if service.protocol=='ollama' else '/models'), 'message': '未在目录中找到；无法据此确认已下线。'}
                        else:
                            fact = self.evidence(entry, service.endpoint + ('/api/tags' if service.protocol == 'ollama' else '/models'))
                            fact['message'] = '厂商未公布停用日期' if not fact['shutdownDate'] else ''
                            if ('shutdown_date' not in entry or entry.get('shutdown_date') is not None and not fact['shutdownDate']) and old.get('shutdownDate') and old.get('source')==fact['source']:
                                fact['shutdownDate']=old['shutdownDate']
                                fact['message']='本次未提供可识别的停用日期，保留上次已知日期'

                        fact.update(self.version_evidence(entry, model.identifier, indexed))
                        shutdown = fact.get('shutdownDate')
                        days = (date.fromisoformat(shutdown) - datetime.now().astimezone().date()).days if shutdown else None
                        fact['status'] = 'retired' if days is not None and days <= 0 else 'expiring' if days is not None and days <= 30 else 'normal' if shutdown else 'unknown'
                        fact['references'] = sum(1 for r in references if r['model'] == model.id)
                        db.execute('INSERT OR REPLACE INTO facts VALUES(?,?,?)', (owner, model.id, json.dumps(fact, ensure_ascii=False)))
            except (ValueError, RuntimeError, OSError) as exc:
                errors.append({'service': service.name, 'message': str(exc)})
        return {'models': self.facts(owner), 'errors': errors, 'checkedModels': [m.id for m in selected], 'checkedAt': now()}

    def report(self,owner):
        models=self.facts(owner)
        try:refs=self.catalog.maintenance.references(owner)
        except (ValueError,OSError) as exc:
            return {'models':models,'history':self.catalog.maintenance.history(owner),'resources':{},'errors':[{'service':'引用索引','message':str(exc)}]}
        existing={m.id for m in self.catalog._read(owner)[0].models}
        for identity in list(models):
            if identity not in existing:models.pop(identity);continue
            models[identity]['references']=sum(1 for r in refs if r['model']==identity)
            if self._expired(models[identity].get('shutdownDate')):models[identity]['status']='retired'
        return {'models':models,'history':self.catalog.maintenance.history(owner),'resources':self.resource_issues(owner)}

    def resource_issues(self,owner):
        facts=self.facts(owner)
        issues={}
        available={m.id for m in self.catalog._read(owner)[0].models}
        for ref in self.catalog.maintenance.references(owner):
            if ref['kind'] not in ('skill','workflow'):continue
            status='missing' if ref['model'].startswith('missing:') or ref['model'] not in available else facts.get(ref['model'],{}).get('status')
            if status in ('missing','retired','expiring'):
                key=ref['kind']+':'+ref['resource']
                issues[key]={'status':status,'message':{'missing':'模型缺失，待配置','retired':'使用的模型已下线','expiring':'使用的模型即将停用'}[status]}
        registry=self.catalog.portal.skill_center.registry
        with registry.db() as db:
            tracked={row[0] for row in db.execute("SELECT id FROM resource WHERE kind='workflow'")}
        for entry in self.catalog.maintenance.library.list('workflows'):
            if entry['id'] in tracked:registry.observe('workflow',entry['id'],entry['revision'])
        with self.catalog.portal.skill_center.registry.db() as db:
            rows=db.execute("SELECT id,state FROM resource WHERE kind='workflow' AND state!='published'").fetchall()
        for row in rows:
            key='workflow:'+row['id']
            issues[key]={**issues.get(key,{'status':'unpublished','message':'模型配置已修改，需验证发布'}),'publicationState':row['state']}
        return issues

    def latest(self, owner, source):
        doc, revision = self.catalog._read(owner)
        model = next((m for m in doc.models if m.id == source), None)
        if model is None: raise ValueError('模型不存在')
        service = next(s for s in doc.services if s.id == model.serviceId)
        entries = self.directory(owner, service)
        ids = sorted({identity for e in entries if isinstance(e,dict) for identity in [e.get('id') if service.protocol!='ollama' else e.get('name')] if isinstance(identity,str) and identity})
        token = uuid.uuid4().hex
        facts = {identity: self.evidence(next(e for e in entries if e.get('id', e.get('name')) == identity), service.endpoint + '/models') for identity in ids}
        with self.lock:
            self.sessions = {k: v for k, v in self.sessions.items() if time.monotonic() - v['time'] < 900}
            if len(self.sessions) >= 100: raise ValueError('预览过多，请稍后重试')
            self.sessions[token] = {'owner': owner, 'source': source, 'time': time.monotonic(), 'facts': facts, 'revision':revision}
        return {'session': token, 'current': model.model_dump(), 'candidates': ids,
                'currentFacts': facts.get(model.identifier, self.facts(owner).get(source, {})),
                'checkedAt': now(), 'note': '厂商目录未提供可信接替关系，请选择目标版本；价格、上下文和能力未提供时显示未知。'}

    def target(self, owner, source, body):
        if not isinstance(body.get('session'),str) or not isinstance(body.get('identifier'),str):raise ValueError('请选择有效的目标版本')
        with self.lock: session = self.sessions.get(body.get('session', ''))
        identity = body.get('identifier')
        if not session or session['owner'] != owner or session['source'] != source or time.monotonic() - session['time'] > 900:
            raise FileExistsError('候选目录已过期，请重新查询')
        if identity not in session['facts']: raise ValueError('目标不在本次厂商目录中')
        doc, revision = self.catalog._read(owner)
        if revision!=session['revision']:raise FileExistsError('模型连接或配置已变化，请重新查询候选版本')
        old = next((m for m in doc.models if m.id == source), None)
        if old is None or identity == old.identifier: raise ValueError('请选择不同的目标模型')
        existing = next((m for m in doc.models if m.serviceId == old.serviceId and m.identifier == identity), None)
        if existing:
            if self.retired(owner,existing.id):raise ValueError('目标版本已有明确停用记录，不能替换')
            target = existing
        else:
            caps = body.get('capabilities', [])
            if not isinstance(caps, list) or 'text' not in caps: raise ValueError('厂商未提供能力信息，请确认目标支持文本及所需能力')
            target = Model(id='upgrade-' + hashlib.sha256((old.serviceId + identity).encode()).hexdigest()[:24],
                           serviceId=old.serviceId, identifier=identity, name=identity[:160], capabilities=caps,
                           orientation=old.orientation, currency=old.currency, capabilitySource='calibrated')
        if self._expired(session['facts'][identity].get('shutdownDate')): raise ValueError('目标版本已到停用日期，不能替换')
        return target, session['facts'][identity]
