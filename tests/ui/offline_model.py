"""Deterministic M04 browser model fixture. Never imported by product code."""
import json
from beivymate.runtime.llm.gateway import LLMGateway
from beivymate.runtime.llm.models import LLMResponse
from beivymate.model.artifact.requirement_understanding import UnderstandingData
from beivymate.model.artifact.test_analysis import AnalysisData


class Provider:
    def __init__(self):
        self.calls = 0

    def chat(self, request):
        self.calls += 1
        cls = UnderstandingData if request.response_schema.get('title') == 'UnderstandingData' else AnalysisData
        data = {name: {'status': 'not_provided', 'reason': '离线验收输入未提供'}
                for name in cls.model_fields if name != 'unknowns'}
        data['unknowns'] = []
        return LLMResponse(model='offline-browser-fixture', content=json.dumps(data))


def install():
    provider = Provider()

    def gateway(*args, **kwargs):
        result = LLMGateway(provider)
        result.configuration_binding = dict(provider='ollama', base_url='http://offline.invalid', timeout=1)
        return result

    import beivymate.application.app as app
    import beivymate.application.run_inputs as inputs
    app.create_gateway = gateway
    inputs.create_gateway = gateway
