from .models import LLMRequest, LLMResponse
from .provider import LLMProvider
from time import perf_counter
from typing import Callable
from .metrics import CallMetric

class LLMGateway:

    def __init__(
        self,
        provider: LLMProvider,
        metrics_sink: Callable[[CallMetric], None] | None = None,
    ):
        self.provider = provider
        self.metrics_sink = metrics_sink
        self.last_metric: CallMetric | None = None
        self.metrics_error: str | None = None

    def chat(
        self,
        request: LLMRequest,
    ) -> LLMResponse:

        started = perf_counter()
        response = None
        error_type = None
        try:
            response = self.provider.chat(request)
            return response
        except Exception as exc:
            error_type = type(exc).__name__
            raise
        finally:
            usage = getattr(response, "usage", None)
            self.last_metric = CallMetric(
                model=request.model, status="failed" if error_type else "success",
                duration_seconds=perf_counter() - started,
                input_tokens=usage.input_tokens if usage else None,
                output_tokens=usage.output_tokens if usage else None,
                estimated_input_units=sum(len(message.content.encode("utf-8")) for message in request.messages),
                error_type=error_type,
            )
            self.metrics_error = None
            if self.metrics_sink:
                try:
                    self.metrics_sink(self.last_metric)
                except Exception as exc:
                    # Logging failure must not trigger a second model/tool request.
                    self.metrics_error = type(exc).__name__
