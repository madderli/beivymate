import pytest
from beivymate.evaluation.report import EvaluationSet
from beivymate.runtime.llm.gateway import LLMGateway
from beivymate.runtime.llm.models import LLMRequest, LLMResponse, LLMUsage, ChatMessage
from beivymate.runtime.llm.metrics import JsonlMetricsSink, CallMetric


def request():
    return LLMRequest(model="fake", messages=[ChatMessage(role="user", content="机密")])


def test_actual_usage_and_private_log(tmp_path):
    class Provider:
        def chat(self, request):
            return LLMResponse(model="fake", content="response", usage=LLMUsage(input_tokens=12, output_tokens=7))
    path = tmp_path / "calls.jsonl"
    gateway = LLMGateway(Provider(), JsonlMetricsSink(path))
    gateway.chat(request())
    metric = CallMetric.model_validate_json(path.read_text())
    assert metric.input_tokens == 12 and metric.output_tokens == 7
    assert metric.estimated_input_units == 6
    assert "机密" not in path.read_text() and "response" not in path.read_text()
    assert metric.duration_seconds >= 0


def test_failure_and_sink_failure_do_not_mask_provider_error():
    class Provider:
        def chat(self, request):
            raise RuntimeError("private error")
    def sink(metric):
        raise OSError("disk unavailable")
    gateway = LLMGateway(Provider(), sink)
    with pytest.raises(RuntimeError, match="private error"):
        gateway.chat(request())
    assert gateway.last_metric.status == "failed"
    assert gateway.last_metric.input_tokens is None
    assert gateway.metrics_error == "OSError"


def test_quality_denominators_and_pending():
    review = dict(case_id="c", artifact_id="a", reviewer="human", rubric_version="1", structured_valid=False,
                  checkpoints={"one":"covered", "two":"missing", "three":"pending"})
    report = EvaluationSet(reviews=[review]).report()
    assert report["structured_valid_rate"] == 0
    assert report["omission_rate_assessed_only"] == .5
    assert not report["review_complete"]
    review["checkpoints"] = {"one":"pending"}
    assert EvaluationSet(reviews=[review]).report()["omission_rate_assessed_only"] is None
