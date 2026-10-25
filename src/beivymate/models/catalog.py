"""Atomic, inspectable local model configuration; credentials live only in the vault."""
from contextlib import nullcontext
import hashlib
import os
from pathlib import Path
import sqlite3
import tempfile
from beivymate.models.schema import Catalog, Service, Model
from beivymate.models.runtime import FrozenGateway
from beivymate.scheduling.locking import exclusive_file
from beivymate.identity.service import IdentityError

TIERS = ['质量优先','均衡','速度优先']


class ModelCatalog:
    def __init__(self, root, vault, portal=None):
        self.root = Path(root)
        self.directory = self.root/'configuration/models'
        self.directory.mkdir(parents=True,exist_ok=True)
        self.vault, self.portal = vault, portal
        self.metrics = self.root/'work/model-calls.sqlite3'
        self.metrics.parent.mkdir(parents=True,exist_ok=True)

    def path(self, owner):
        return self.directory/('catalog-'+hashlib.sha256(owner.encode()).hexdigest()[:24]+'.json')

    def exists(self, owner):
        return self.path(owner).exists()

    def _read(self, owner):
        path = self.path(owner)
        raw = path.read_bytes() if path.exists() else b''
        value = Catalog.model_validate_json(raw) if raw else Catalog()
        return value,hashlib.sha256(raw).hexdigest()

    def _write(self, owner, value):
        text = value.model_dump_json(indent=2).encode()
        fd, name = tempfile.mkstemp(dir=self.directory,prefix='.models-')
        try:
            with os.fdopen(fd,'wb') as stream:
                stream.write(text); stream.flush(); os.fsync(stream.fileno())
            os.replace(name,self.path(owner))
        finally:
            Path(name).unlink(missing_ok=True)

    def _configured(self, service, owner):
        # A vault read is a real availability check, never an inference from a UI flag.
        return service.auth=='none' or bool(os.environ.get(service.apiKeyEnv or '') or self.vault.get(owner,service.id))

    def view(self, owner):
        with exclusive_file(self.path(owner).with_suffix('.lock')):
            value,revision = self._read(owner)
            if not self.exists(owner):
                # Import user-authored Markdown only; never seed bundled examples.
                from beivymate.configuration.loader import load_model_definition
                for path in sorted(self.directory.glob('*.md')):
                    legacy = load_model_definition(path)
                    if legacy.provider not in ('openai_compatible','ollama') or not legacy.base_url:
                        continue
                    sid='legacy-'+hashlib.sha256(str(path).encode()).hexdigest()[:12]
                    value.services.append(Service(id=sid,name=legacy.name,endpoint=legacy.base_url,protocol=legacy.provider,
                        auth='none' if legacy.provider=='ollama' else 'key',apiKeyEnv=legacy.api_key_env,enabled=legacy.enabled))
                    value.models.append(Model(id=legacy.id,serviceId=sid,name=legacy.name,identifier=legacy.model,enabled=legacy.enabled))
                    if path.name=='default.md':
                        value.defaults.general=legacy.id
                self._write(owner,value)
                value,revision=self._read(owner)
        result=value.model_dump(); result['revision']=revision
        for service in result['services']:
            source=next(s for s in value.services if s.id==service['id'])
            try:
                service['configured']=self._configured(source,owner)
                service['credentialError']=''
            except IdentityError as exc:
                service['configured']=False; service['credentialError']=str(exc)
        return result

    def _check(self, value):
        services={s.id:s for s in value.services}; models={m.id:m for m in value.models}
        if len(services)!=len(value.services) or len(models)!=len(value.models):
            raise ValueError('厂商或模型标识重复')
        seen=set()
        for m in value.models:
            if m.serviceId not in services:
                raise ValueError('模型引用了不存在的厂商')
            key=(m.serviceId,m.identifier)
            if key in seen:
                raise ValueError('同一厂商下模型 ID 重复')
            seen.add(key)
            if 'text' not in m.capabilities:
                raise ValueError('当前支持文本模型；其他能力可补充声明')
        missing=lambda identity: identity.startswith('missing:') and identity[8:] in value.missingModels
        for identity in [value.defaults.general,value.defaults.chat,value.defaults.skill]:
            if identity and not missing(identity) and (identity not in models or not models[identity].enabled or not services[models[identity].serviceId].enabled):
                raise ValueError('默认模型必须指向已启用的模型及厂商；请先调整默认设置')
        if set(value.tiers)!=set(TIERS) or set(value.backups)!=set(TIERS):
            raise ValueError('模型档位配置不完整')
        for tier in TIERS:
            chain=[value.tiers[tier],*value.backups[tier]]
            ids=[i for i in chain if i]
            if len(ids)!=len(set(ids)) or any(i not in models and not missing(i) for i in ids):
                raise ValueError('主备模型重复或引用不存在的模型')
            if any(models[i].orientation != tier for i in ids if i in models):
                raise ValueError('主备模型必须属于所选档位，请先修改模型档位或重新选择')

    def save(self, owner, body):
        if not isinstance(body,dict) or 'revision' not in body:
            raise ValueError('保存配置需要修订标识')
        fields=dict(body); expected=fields.pop('revision')
        value=Catalog.model_validate(fields); self._check(value)
        with exclusive_file(self.path(owner).with_suffix('.lock')):
            old,revision=self._read(owner)
            if expected!=revision:
                raise FileExistsError('模型配置已变化，请重新加载并核对，未覆盖原配置')
            old_models={m.id:m for m in old.models}; new_models={m.id:m for m in value.models}
            if hasattr(self,'maintenance') and set(old_models)-set(new_models):
                raise ValueError('删除模型请使用引用影响预览和确认删除入口')
            changed={identity for identity,m in old_models.items() if identity not in new_models or new_models[identity]!=m}
            old_services={s.id:s for s in old.services}; new_services={s.id:s for s in value.services}
            changed_services={sid for sid,s in old_services.items() if sid not in new_services or new_services[sid]!=s}
            changed.update(m.id for m in old.models if m.serviceId in changed_services)
            with self._guard(old,changed):
                self._write(owner,value)
        return self.view(owner)

    def _guard(self, old, identities):
        if not self.portal or not identities:
            return nullcontext()
        return self.portal.model_guard(old,identities)

    def credential(self, owner, identity, secret):
        if not isinstance(secret,str) or not secret.strip() or len(secret)>8192:
            raise ValueError('请输入有效密钥')
        with exclusive_file(self.path(owner).with_suffix('.lock')):
            doc,_=self._read(owner)
            if not any(s.id==identity for s in doc.services):
                raise ValueError('厂商不存在')
            with self._guard(doc,{m.id for m in doc.models if m.serviceId==identity}):
                self.vault.save(owner,identity,secret.strip())
                service=next(s for s in doc.services if s.id==identity)
                service.apiKeyEnv=None
                self._write(owner,doc)
        return {'saved':True}

    def delete_credential(self, owner, identity):
        with exclusive_file(self.path(owner).with_suffix('.lock')):
            doc,_=self._read(owner)
            with self._guard(doc,{m.id for m in doc.models if m.serviceId==identity}):
                self.vault.delete(owner,identity)
        return {'deleted':True}

    def discover(self, owner, identity):
        doc,_=self._read(owner); service=next((s for s in doc.services if s.id==identity),None)
        if service is None or not service.enabled:
            raise ValueError('厂商不存在或已停用')
        return self.discover_connection(owner,service)

    def discover_connection(self, owner, service, secret=None):
        service=Service.model_validate(service) if isinstance(service,dict) else service
        entries=self.directory_entries(owner,service,secret)
        ids=[m.get('name' if service.protocol=='ollama' else 'id') for m in entries if isinstance(m,dict)]
        return {'models':sorted({i for i in ids if isinstance(i,str) and i.strip()}),
            'note':'目录可读取不代表模型已通过实际调用测试；未返回的既有模型不会自动下线。'}

    def directory_entries(self, owner, service, secret=None):
        from beivymate.runtime.llm.transport import HTTPTransport
        from beivymate.runtime.llm.models import LLMConnectionConfig
        key=((secret.strip() if isinstance(secret,str) else None) if secret is not None else (os.environ.get(service.apiKeyEnv or '') or self.vault.get(owner,service.id))) if service.auth=='key' else None
        if service.auth=='key' and not key:raise ValueError('请填写密钥，或明确使用已保存的密钥')
        transport=HTTPTransport(LLMConnectionConfig(base_url=service.endpoint,timeout=30,self_signed=service.selfCert))
        payload=transport.get_json(service.endpoint+('/api/tags' if service.protocol=='ollama' else '/models'),
            {'Authorization':'Bearer '+key} if key else {})
        if not isinstance(payload,dict):
            raise ValueError('服务返回的内容不是可识别的模型目录，请检查 API 地址，或手动添加模型。')
        entries=payload.get('models') if service.protocol=='ollama' else payload.get('data')
        if not isinstance(entries,list):
            raise ValueError('厂商返回的模型目录格式无效，请手动添加')
        return entries

    def snapshot(self, owner, *, purpose='skill', selection=None, required=(), task=None):
        if purpose not in ('chat','skill') or not isinstance(selection,(str,dict,type(None))):
            raise ValueError('模型用途或选择格式不正确')
        if not isinstance(required,(list,tuple,set)) or any(c not in ('text','structured','tools','images','reasoning') for c in required):
            raise ValueError('所需模型能力格式不正确')
        if isinstance(selection,dict):
            if selection.get('mode','inherit') not in ('inherit','specific','tier','none'):
                raise ValueError('模型选择方式不正确')
            if not isinstance(selection.get('capabilities',[]),list) or any(c not in ('text','structured','tools','images','reasoning') for c in selection.get('capabilities',[])):
                raise ValueError('所需模型能力格式不正确')
            if any(k in selection and not isinstance(selection[k],str) for k in ('model','tier','minTier')):
                raise ValueError('模型或档位格式不正确')
        with exclusive_file(self.path(owner).with_suffix('.lock')):
            doc,_=self._read(owner)
            override=doc.defaults.chat if purpose=='chat' else doc.defaults.skill
            selection=selection or override or doc.defaults.general
            minimum=None
            failure_strategy='inherit'
            if isinstance(selection,dict):
                required=set(required)|set(selection.get('capabilities',[]))
                failure_strategy=selection.get('failureStrategy','inherit')
                if failure_strategy not in ('inherit','fail_fast','fallback'):raise ValueError('技能失败策略无效')
                minimum=selection.get('minTier')
                mode=selection.get('mode','inherit')
                if mode=='none':
                    raise ValueError('此步骤配置为不使用模型')
                selection=selection.get('model') if mode=='specific' else doc.tiers.get(selection.get('tier','均衡'),'') if mode=='tier' else override or doc.defaults.general
            models={m.id:m for m in doc.models}; services={s.id:s for s in doc.services}
            if isinstance(selection,str) and selection.startswith('missing:'):
                raise ValueError('模型已删除，当前配置缺少模型，请重新配置；不会自动使用默认模型')
            if not selection or selection not in models:
                raise ValueError('请先在模型配置中选择通用默认模型，或指定可用模型')
            primary=models[selection]; start=TIERS.index(primary.orientation)
            ids=[selection]
            policy=doc.failover.model_dump()
            if failure_strategy=='fail_fast':policy.update(strategy='error',retries=0)
            elif failure_strategy=='fallback' and policy['strategy']=='error':policy['strategy']='same'
            if policy['strategy']!='error':
                ids+=doc.backups[primary.orientation]
                if policy['strategy']=='cross':
                    for tier in TIERS[start+1:]:
                        ids += [doc.tiers[tier],*doc.backups[tier]]
            candidates=[]; seen=set()
            for identity in ids:
                if not identity or identity in seen:
                    continue
                seen.add(identity); model=models.get(identity)
                if model is None:
                    continue
                service=services[model.serviceId]
                retired=hasattr(self,'lifecycle') and self.lifecycle.retired(owner,model.id)
                available=not retired and model.enabled and service.enabled and set(required).issubset(model.capabilities)
                if minimum and minimum in TIERS and TIERS.index(model.orientation)>TIERS.index(minimum):
                    available=False
                if not available or not self._configured(service,owner):
                    if identity==selection and retired and policy['strategy']!='error':
                        continue
                    if identity==selection:
                        raise ValueError('所选模型已停用、未启用、缺少凭据或不满足所需能力，请调整模型配置')
                    continue
                candidate=model.model_dump(); candidate['service']=service.model_dump(); candidates.append(candidate)
            if not candidates:
                raise ValueError('没有符合条件的可用模型')
            snapshot={'owner':owner,'candidates':candidates,'policy':policy,'metrics':str(self.metrics),'purpose':purpose,'lifecycle':str(self.lifecycle.path) if hasattr(self,'lifecycle') else None}
            if task and self.portal:
                with self.portal.db() as db:
                    for candidate in candidates:
                        db.execute('INSERT OR IGNORE INTO resource_reference VALUES (?,?,?)',(task,'model',candidate['id']))
            return snapshot

    def gateway(self, owner, **kwargs):
        snapshot=self.snapshot(owner,**kwargs)
        return FrozenGateway(snapshot,vault=self.vault),snapshot['candidates'][0]['identifier']

    def probe(self, owner, identity):
        from beivymate.runtime.llm.models import LLMRequest, ChatMessage
        snapshot=self.snapshot(owner,purpose='chat',selection=identity,required=['text'])
        snapshot['candidates']=snapshot['candidates'][:1]
        snapshot['policy'].update(strategy='error',retries=0,timeout=30)
        gateway=FrozenGateway(snapshot,vault=self.vault)
        try:
            response=gateway.chat(LLMRequest(model=snapshot['candidates'][0]['identifier'],
                messages=[ChatMessage(role='user',content='Reply with OK.')],temperature=None,max_output_tokens=1024))
        except (RuntimeError, OSError, ValueError) as exc:
            from urllib.error import HTTPError, URLError
            import ssl
            import re
            cause=exc
            while cause.__cause__:cause=cause.__cause__
            status=getattr(exc,"status_code",None) or (cause.code if isinstance(cause,HTTPError) else None)
            if status is None:
                match=re.search(r'status=(\d+)',str(exc))
                status=int(match[1]) if match else None
            reason=cause.reason if isinstance(cause,URLError) else cause
            kind=getattr(exc,'failure_kind',None)
            if kind=='output_limit':message='本次测试达到输出上限，未取得完整回复；这不代表模型不可用，请调整模型配置后重试。'
            elif kind=='refusal':message='模型拒绝了本次测试请求，请检查厂商使用限制。'
            elif kind=='timeout':message='模型响应超时，请检查网络或稍后重试。'
            elif kind=='unsupported_request' or status==400:message='该模型不支持当前文本对话接口或请求参数；目录可见不代表支持此调用方式，请检查模型类型和 API 配置。'
            elif isinstance(reason,ssl.SSLCertVerificationError):message='服务证书校验失败，请检查本机证书及代理配置。'
            elif isinstance(reason,TimeoutError):message='模型响应超时，请检查网络和代理后重试。'
            elif status==401:message='API Key 无效或已失效，请在编辑厂商中更新密钥。'
            elif status==403:message='当前账号没有调用权限，或服务限制了当前网络地区。'
            elif status==404:message='未找到模型或调用接口，请检查模型 ID 和厂商 API 地址。'
            elif status==429:message='调用频率或账号额度受限，请稍后重试并检查账户额度。'
            elif status and status>=500:message='厂商服务暂时不可用，请稍后重试。'
            elif isinstance(reason,OSError):message='无法连接模型，请检查网络、代理及服务地址。'
            else:message='模型未能返回有效回复，请检查该模型是否支持文本对话及当前接口。'
            raise ValueError(message) from None
        from datetime import datetime,timezone
        return {'available':True,'actualModel':response.model,'testedAt':datetime.now(timezone.utc).isoformat(),
            'verifiedCapabilities':['text'],'note':'文本调用通过；其他能力为手工声明，未在此测试中验证。'}

    def usage(self, owner):
        if not self.metrics.exists():
            return {'calls':0,'inputTokens':0,'outputTokens':0,'costs':{},'unknownCostCalls':0}
        from datetime import datetime, timezone
        local=datetime.now().astimezone()
        start=local.replace(day=1,hour=0,minute=0,second=0,microsecond=0)
        end=start.replace(year=start.year+1,month=1) if start.month==12 else start.replace(month=start.month+1)
        with sqlite3.connect(self.metrics) as db:
            if not db.execute("SELECT 1 FROM sqlite_master WHERE name='model_call'").fetchone():
                return {'calls':0,'inputTokens':0,'outputTokens':0,'costs':{},'unknownCostCalls':0}
            rows=db.execute('SELECT input_tokens,output_tokens,cost,currency,model_id FROM model_call WHERE owner=? AND at>=? AND at<?', (owner,start.astimezone(timezone.utc).isoformat(),end.astimezone(timezone.utc).isoformat())).fetchall()
        costs={}
        by_tier={t:0 for t in TIERS}
        models={m.id:m for m in self._read(owner)[0].models}
        for _,_,cost,currency,identity in rows:
            if cost is not None and currency=='CNY' and identity in models:
                by_tier[models[identity].orientation]+=cost
            if cost is not None: costs[currency]=costs.get(currency,0)+cost
        return {'calls':len(rows),'inputTokens':sum(r[0] or 0 for r in rows),'outputTokens':sum(r[1] or 0 for r in rows),
            'costs':costs,'byTier':by_tier,'unknownCostCalls':sum(r[2] is None for r in rows)}
