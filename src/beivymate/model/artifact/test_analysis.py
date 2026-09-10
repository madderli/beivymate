"""M6 analysis deliverable: test conditions, not executable test cases."""
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from uuid import uuid4

from pydantic import Field, model_validator
from beivymate.model.artifact.requirement_understanding import Contract, Text, Section, Unknown, SourceSnapshot


class AnalysisData(Contract):
    scope: Section
    test_conditions: Section
    risk_priorities: Section
    dependencies: Section
    regression: Section
    handoff: Section
    unknowns: list[Unknown]

    def render_markdown(self, locale=None):
        zh = locale == "zh-CN"
        titles = ["测试范围", "测试条件与关注点", "风险与优先级依据", "依赖与约束", "回归关注范围", "测试设计交接"]
        lines = ["# 测试分析" if zh else "# Test Analysis"]
        names = [name for name in type(self).model_fields if name != "unknowns"]
        for name, title in zip(names, titles):
            section = getattr(self, name)
            lines.extend(["", "## " + (title if zh else name), "", section.status])
            if section.reason:
                lines.append(section.reason)
            for item in section.items:
                lines.append(f"- [{item.basis}] {item.text} ({', '.join(item.source_refs)})")
        lines.extend(["", "## 待确认问题" if zh else "## Unknowns", ""])
        for item in self.unknowns:
            lines.append(f"- {item.question}: {item.impact} (blocking={item.blocking}; {', '.join(item.source_refs)})")
        return "\n".join(lines)


class AnalysisArtifact(Contract):
    schema_version: Literal["1"] = "1"
    id: Text = Field(default_factory=lambda: str(uuid4()))
    revision: int = Field(default=1, ge=1)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    task_id: Text | None = None
    run_id: Text | None = None
    step_id: Text
    requirement_id: Text
    understanding_id: Text
    understanding_revision: int = Field(ge=1)
    understanding_hash: Text
    model: Text
    locale: Text | None = None
    sources: list[SourceSnapshot] = Field(min_length=3)
    raw_response: str
    data: AnalysisData | None = None
    validation_status: Literal["structured", "unvalidated"]
    validation_errors: list[str] = Field(default_factory=list)
    acceptance: Literal["pending"] = "pending"

    @model_validator(mode="after")
    def validate_data(self):
        if (self.data is not None) != (self.validation_status == "structured"):
            raise ValueError("Structured status requires analysis data")
        refs = [source.ref for source in self.sources]
        if len(refs) != len(set(refs)):
            raise ValueError("Duplicate source references")
        if self.data:
            used = [ref for name in type(self.data).model_fields if name != 'unknowns'
                    for item in getattr(self.data, name).items for ref in item.source_refs]
            used += [ref for item in self.data.unknowns for ref in item.source_refs]
            if set(used) - {ref for ref in refs if not ref.startswith('template:')}:
                raise ValueError("Unknown analysis source references")
        return self

    def require_data(self):
        if self.data is None:
            raise ValueError("Analysis is not structurally validated")
        return self.data

    @property
    def markdown(self):
        return self.data.render_markdown(self.locale) if self.data else self.raw_response

    def save_new(self, path: Path):
        with path.open('x', encoding='utf-8') as stream:
            stream.write(self.model_dump_json(indent=2))

    @classmethod
    def load(cls, path: Path):
        return cls.model_validate_json(path.read_text(encoding='utf-8'))
