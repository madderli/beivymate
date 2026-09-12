"""Chat Completions adapter for configured cloud providers; never selects a fallback model."""
import time
from urllib.error import HTTPError, URLError

from ..models import LLMConnectionConfig, LLMRequest, LLMResponse, LLMUsage
from ..transport import HTTPTransport


class OpenAICompatibleProvider:
    def __init__(self, config: LLMConnectionConfig, max_retries=2):
        if not config.api_key or not config.api_key.strip():
            raise ValueError('Cloud model requires an API key environment variable')
        self.config = config
        self.transport = HTTPTransport(config)
        self.max_retries = max_retries

    def chat(self, request: LLMRequest) -> LLMResponse:
        payload = dict(model=request.model, messages=[m.model_dump() for m in request.messages],
                       temperature=request.temperature, stream=False)
        if request.max_output_tokens is not None:
            payload['max_completion_tokens'] = request.max_output_tokens
        if request.response_schema is not None:
            # Preserve optional/default fields in the domain schema. Local Pydantic
            # and business validation remain mandatory; no silent JSON-mode downgrade.
            payload['response_format'] = {'type':'json_schema', 'json_schema':{
                'name':'stage_output', 'strict':False, 'schema':request.response_schema}}
        for attempt in range(self.max_retries + 1):
            try:
                result = self.transport.post_json(
                    self.config.base_url.rstrip('/') + '/chat/completions', payload,
                    headers={'Authorization':'Bearer ' + self.config.api_key})
                break
            except (RuntimeError, TimeoutError) as exc:
                cause = exc.__cause__ or exc
                status = cause.code if isinstance(cause, HTTPError) else None
                transient = status in {429,500,502,503,504} or (status is None and isinstance(cause, (URLError,TimeoutError)))
                if not transient or attempt == self.max_retries:
                    # Do not persist remote error bodies which may echo credentials or prompts.
                    raise RuntimeError(f'Cloud LLM request failed (status={status or "connection"}, attempts={attempt+1})') from None
                delay = 2 ** attempt
                if isinstance(cause, HTTPError):
                    try:
                        delay = max(delay, float(cause.headers.get('Retry-After', delay)))
                    except (ValueError, TypeError, AttributeError):
                        pass
                if delay > 30:
                    raise RuntimeError('Cloud LLM rate limit requires waiting; retry later') from None
                time.sleep(delay)
        try:
            choice = result['choices'][0]
            if choice.get('finish_reason') != 'stop' or choice['message'].get('refusal'):
                raise ValueError('Incomplete or refused response')
            content = choice['message']['content']
            if not isinstance(content, str) or not content.strip():
                raise ValueError('Empty response')
            usage = result.get('usage') or {}
            return LLMResponse(model=result.get('model') or request.model, content=content,
                usage=LLMUsage(input_tokens=usage.get('prompt_tokens'), output_tokens=usage.get('completion_tokens')))
        except (KeyError, IndexError, TypeError, ValueError):
            raise RuntimeError('Cloud LLM returned an invalid, incomplete or refused response') from None
