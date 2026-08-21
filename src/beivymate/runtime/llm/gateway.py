from .models import LLMRequest, LLMResponse
from .provider import LLMProvider

class LLMGateway:

    def __init__(
        self,
        provider: LLMProvider,
    ):
        self.provider = provider

    def chat(
        self,
        request: LLMRequest,
    ) -> LLMResponse:

        return self.provider.chat(request)