"""Report facts are computed; assessment is a proposal, never a release decision."""
from typing import Literal
from uuid import uuid4
from pydantic import Field
from beivymate.model.artifact.requirement_understanding import Contract, Text, SourceSnapshot
from beivymate.model.artifact.test_execution import now


class ReportAssessment(Contract):
    requirement_conformance: Text
    customer_impact: Text
    risks: list[Text]
    recommendation: Literal['建议发布','有条件发布','不建议发布','无法评估']
    rationale: Text


class ReportArtifact(Contract):
    id: Text = Field(default_factory=lambda: str(uuid4()))
    schema_version: Literal['1'] = '1'
    series_id: Text = Field(default_factory=lambda: str(uuid4()))
    revision: int = Field(default=1, ge=1)
    previous_report_id: Text | None = None
    model_assessment: ReportAssessment | None = None
    adjustment_reasons: list[str] = Field(default_factory=list)
    report_type: Literal['brief'] = 'brief'
    created_at: Text = Field(default_factory=now)
    task_id: Text
    simulation: bool
    sources: list[SourceSnapshot]
    facts: dict
    assessment: ReportAssessment
    raw_response: str
    model: Text
    limitations: list[str]
    release_decision: Literal['pending_human'] = 'pending_human'
