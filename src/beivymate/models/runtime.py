"""Frozen model selection and bounded failover; resolve only secret references at call time."""
import os
import re
import sqlite3
import time
from urllib.error import HTTPError, URLError
from beivymate.runtime.llm.models import LLMConnectionConfig


def failure_kind(error):
    if getattr(error, "failure_kind", None):
        return error.failure_kind
    cause = error
    while cause.__cause__:
        cause = cause.__cause__
    status = cause.code if isinstance(cause, HTTPError) else None
    if status is None:
        match = re.search(r'status=(\d+)', str(error))
        status = int(match[1]) if match else None
    if status == 429:
        return '429'
    if status and 500 <= status < 600:
        return 'server'
    if isinstance(cause, TimeoutError) or isinstance(cause, URLError) and isinstance(cause.reason, TimeoutError):
        return 'timeout'
    return 'other'


def safe_failure(message, original):
    """Keep structured diagnostics without retaining remote bodies or prompts."""
    error=RuntimeError(message)
    error.failure_kind=getattr(original,'failure_kind',None) or failure_kind(original)
    match=re.search(r'status=(\d+)',str(original))
    error.status_code=getattr(original,'status_code',None) or (int(match[1]) if match else None)
    return error


class FrozenGateway:
    def __init__(self, snapshot, *, vault=None):
        from beivymate.identity.credentials import CredentialVault
        self.snapshot = snapshot
        self.vault = vault or CredentialVault()
        self.configuration_binding = {'catalog_snapshot': snapshot}
        self.last_model = ''
        self.events = []

    def _provider(self, candidate):
        service = candidate['service']
        secret = None
        if service['auth'] == 'key':
            secret = os.environ.get(service.get('apiKeyEnv') or '')
            if not secret:
                secret = self.vault.get(self.snapshot['owner'], service['id'])
            if not secret:
                raise ValueError('模型凭据缺失，请在模型配置中更新密钥')
        config = LLMConnectionConfig(base_url=service['endpoint'], api_key=secret,
            timeout=self.snapshot['policy']['timeout'], self_signed=service['selfCert'],
            allow_unauthenticated=service['auth']=='none')
        if service['protocol'] == 'ollama':
            from beivymate.runtime.llm.providers.ollama import OllamaProvider
            return OllamaProvider(config)
        from beivymate.runtime.llm.providers.openai_compatible import OpenAICompatibleProvider
        return OpenAICompatibleProvider(config,max_retries=0)

    def chat(self, request):
        from beivymate.runtime.llm.gateway import LLMGateway
        error = None
        policy = self.snapshot['policy']
        for candidate in self.snapshot['candidates']:
            lifecycle=self.snapshot.get('lifecycle')
            if lifecycle:
                from datetime import date,datetime
                with sqlite3.connect(lifecycle,timeout=15) as db:
                    row=db.execute('SELECT data FROM facts WHERE owner=? AND id=?',(self.snapshot['owner'],candidate['id'])).fetchone()
                import json
                fact=json.loads(row[0]) if row else {}
                expected=candidate['service']['endpoint']+('/api/tags' if candidate['service']['protocol']=='ollama' else '/models')
                shutdown=fact.get('shutdownDate') if fact.get('source')==expected else None
                if shutdown and date.fromisoformat(shutdown)<=datetime.now().astimezone().date():
                    self.events.append({'modelId':candidate['id'],'event':'retired'})
                    if policy['strategy']=='error':raise ValueError('模型已到厂商停用日期，请更换模型后再启动')
                    continue
            self.events.append({'modelId':candidate['id'], 'event':'attempt'})
            error = None
            try:
                provider = self._provider(candidate)
                gateway = LLMGateway(provider, metrics_sink=lambda m:self._metric(candidate,m))
                for attempt in range(policy['retries']+1):
                    try:
                        response = gateway.chat(request.model_copy(update={'model':candidate['identifier']}))
                        self.last_model = response.model
                        self.events.append({'modelId':candidate['id'],'event':'success','actualModel':response.model})
                        return response
                    except Exception as exc:
                        kind = failure_kind(exc)
                        error = (kind, exc)
                        self.events.append({'modelId':candidate['id'],'event':'failed','reason':kind})
                        if kind not in policy['triggers']:
                            raise safe_failure('模型调用失败：鉴权、服务地址或响应格式不正确；未自动切换模型。',exc) from None
                        if attempt < policy['retries']:
                            time.sleep(min(2**attempt,4))
            except (RuntimeError, ValueError) as exc:
                if error is None or failure_kind(error[1]) not in policy['triggers']:
                    raise safe_failure('模型调用失败，请检查密钥、连接和响应格式；未自动更换模型。',error[1] if error else exc) from None
                if policy['strategy']=='error':
                    break
        raise safe_failure('模型调用失败，已用尽配置允许的重试／备用模型；原因：' + (error[0] if error else '配置不可用'),error[1] if error else ValueError('配置不可用')) from None

    def _metric(self, candidate, metric):
        path = self.snapshot.get('metrics')
        if not path:
            return
        with sqlite3.connect(path,timeout=15) as db:
            db.execute('''CREATE TABLE IF NOT EXISTS model_call (
                owner TEXT, at TEXT, model_id TEXT, actual_model TEXT, status TEXT,
                input_tokens INTEGER, output_tokens INTEGER, duration REAL, cost REAL, currency TEXT)''')
            model = candidate
            cost = None
            if metric.input_tokens is not None and metric.output_tokens is not None and model.get('inputPrice') is not None and model.get('outputPrice') is not None:
                cost = (metric.input_tokens*model['inputPrice']+metric.output_tokens*model['outputPrice'])/model.get("priceUnit",1000)
            db.execute('INSERT INTO model_call VALUES (?,?,?,?,?,?,?,?,?,?)',
                (self.snapshot['owner'],metric.created_at.isoformat(),model['id'],metric.model,metric.status,
                 metric.input_tokens,metric.output_tokens,metric.duration_seconds,cost,model.get('currency','CNY')))
