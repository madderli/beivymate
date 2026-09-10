import json

import pytest

from beivymate.agent.tester.skills.tester_requirement_understanding import TesterRequirementUnderstandingSkill
from beivymate.configuration.models import TemplateDefinition
from beivymate.model.artifact.requirement_understanding import UnderstandingArtifact, UnderstandingData
from beivymate.model.entity.requirement import Requirement
from beivymate.runtime.context import AgentContext
from beivymate.runtime.llm.models import LLMResponse


def payload():
    data = {name: {"status": "not_provided", "reason": "需求未提供", "items": []}
            for name in UnderstandingData.model_fields if name != "unknowns"}
    data["objective_scope"] = {"status": "provided", "items": [
        {"text": "支持支付", "basis": "explicit", "source_refs": ["requirement:REQ-1"]}]}
    data["unknowns"] = [{"question": "是否允许取消？", "impact": "取消场景无法确定",
                         "blocking": True, "source_refs": ["requirement:REQ-1"]}]
    return data


def execute(content, path=None):
    class Gateway:
        def chat(self, request):
            assert "Machine-readable output contract" in request.messages[1].content
            return LLMResponse(model="fake", content=content)

    skill = TesterRequirementUnderstandingSkill(Gateway(), "fake", TemplateDefinition(
        id="template", name="需求理解", role="tester", version="1", content="分析业务规则"))
    context = AgentContext()
    context.set("requirement", Requirement(id="REQ-1", title="支付", content="支持支付"))
    context.set("requirement_version", "2")
    context.set("task_id", "TASK-1")
    context.set("run_id", "RUN-1")
    if path:
        context.set("requirement_understanding_artifact_path", path)
    skill.execute(context)
    return context


def test_structured_artifact_roundtrip_and_provenance(tmp_path):
    path = tmp_path / "understanding.json"
    context = execute(json.dumps(payload(), ensure_ascii=False), path)
    artifact = context.get("tester_requirement_understanding_artifact")
    assert UnderstandingArtifact.load(path) == artifact
    assert artifact.validation_status == "structured"
    assert artifact.acceptance == "pending"
    assert artifact.sources[0].version == "2"
    assert artifact.task_id == "TASK-1" and artifact.run_id == "RUN-1"
    assert artifact.data.unknowns[0].blocking
    assert "支持支付" in context.get("tester_requirement_understanding")
    with pytest.raises(FileExistsError):
        artifact.save_new(path)
    saved = json.loads(path.read_text())
    saved["sources"][0]["content"] = "tampered"
    path.write_text(json.dumps(saved))
    with pytest.raises(ValueError, match="hash mismatch"):
        UnderstandingArtifact.load(path)


@pytest.mark.parametrize("invalid", ["旧 Markdown", '{"objective_scope": {}}'])
def test_legacy_or_invalid_output_never_marked_structured(invalid):
    artifact = execute(invalid).get("tester_requirement_understanding_artifact")
    assert artifact.data is None
    assert artifact.validation_status == "unvalidated"
    assert artifact.validation_errors
    assert artifact.markdown == invalid


@pytest.mark.parametrize("ref", ["requirement:invented", "template:template"])
def test_unknown_or_template_evidence_rejected(ref):
    data = payload()
    data["objective_scope"]["items"][0]["source_refs"] = [ref]
    artifact = execute(json.dumps(data)).get("tester_requirement_understanding_artifact")
    assert artifact.validation_status == "unvalidated"


def test_empty_response_rejected():
    with pytest.raises(ValueError, match="response is empty"):
        execute("  ")


def test_missing_section_and_unexplained_empty_section_rejected():
    data = payload()
    del data["handoff"]
    with pytest.raises(ValueError):
        UnderstandingData.model_validate(data)
    data = payload()
    data["handoff"] = {"status": "not_analyzed"}
    with pytest.raises(ValueError):
        UnderstandingData.model_validate(data)
