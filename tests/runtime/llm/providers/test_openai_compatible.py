import json
from urllib.error import HTTPError
import pytest
from beivymate.runtime.llm.models import LLMConnectionConfig, LLMRequest, ChatMessage
from beivymate.runtime.llm.providers.openai_compatible import OpenAICompatibleProvider


def request():
    return LLMRequest(model='test-model',messages=[ChatMessage(role='user',content='Return JSON')],
                      response_schema={'type':'object'},max_output_tokens=100)


def response():
    return {'model':'test-model','choices':[{'finish_reason':'stop','message':{'content':'{}'}}],
            'usage':{'prompt_tokens':12,'completion_tokens':3}}


def test_payload_usage_and_secret_exclusion(monkeypatch):
    config=LLMConnectionConfig(base_url='https://example.test/v1/',api_key='test-secret')
    provider=OpenAICompatibleProvider(config)
    def post(url,payload,headers):
        assert url=='https://example.test/v1/chat/completions'
        assert headers['Authorization']=='Bearer test-secret'
        assert payload['response_format']['json_schema']['strict'] is False
        assert payload['max_completion_tokens']==100
        return response()
    monkeypatch.setattr(provider.transport,'post_json',post)
    result=provider.chat(request())
    assert result.usage.input_tokens==12 and result.usage.output_tokens==3
    assert 'test-secret' not in repr(config)+config.model_dump_json()


@pytest.mark.parametrize('status,attempts',[(429,3),(503,3),(401,1),(400,1)])
def test_retry_bound_and_error_redaction(monkeypatch,status,attempts):
    provider=OpenAICompatibleProvider(LLMConnectionConfig(base_url='https://example.test',api_key='test-secret'))
    calls=[]
    def post(*args,**kwargs):
        calls.append(1)
        try:
            raise HTTPError('https://example.test',status,'remote',{},None)
        except HTTPError as exc:
            raise RuntimeError('test-secret remote payload') from exc
    monkeypatch.setattr(provider.transport,'post_json',post)
    monkeypatch.setattr('beivymate.runtime.llm.providers.openai_compatible.time.sleep',lambda _:None)
    with pytest.raises(RuntimeError) as error: provider.chat(request())
    assert len(calls)==attempts and 'test-secret' not in str(error.value)


def test_truncation_not_accepted_or_retried(monkeypatch):
    provider=OpenAICompatibleProvider(LLMConnectionConfig(base_url='https://example.test',api_key='key'))
    result=response(); result['choices'][0]['finish_reason']='length'
    monkeypatch.setattr(provider.transport,'post_json',lambda *a,**kw:result)
    with pytest.raises(RuntimeError,match='incomplete'): provider.chat(request())


def test_gateway_requires_environment_key(monkeypatch):
    from beivymate.application.app import create_gateway
    monkeypatch.delenv('TEST_CLOUD_KEY',raising=False)
    with pytest.raises(ValueError,match='API key'):
        create_gateway('openai_compatible','https://example.test',10,api_key_env='TEST_CLOUD_KEY')


@pytest.mark.llm
def test_cloud_schema_generation():
    import os
    from beivymate.application.app import create_gateway, MODEL_PATH
    from beivymate.configuration.loader import load_model_definition
    config=load_model_definition(MODEL_PATH)
    if not os.environ.get(config.api_key_env):
        pytest.skip('Set GROQ_API_KEY to enable cloud validation')
    gateway=create_gateway(config.provider,config.base_url,config.timeout,
                           api_key_env=config.api_key_env,max_retries=config.max_retries)
    result=gateway.chat(LLMRequest(model=config.model,messages=[ChatMessage(role='user',content='Return JSON with ok equal to true.')],
        response_schema={'type':'object','properties':{'ok':{'type':'boolean','enum':[True]}},'required':['ok'],'additionalProperties':False},max_output_tokens=512))
    assert json.loads(result.content)=={'ok':True}
