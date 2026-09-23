"""Structured content is authoritative; legacy prose is explicitly unvalidated."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Text = Annotated[str, StringConstraints(min_length=1, strip_whitespace=True)]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Finding(Contract):
    text: Text
    basis: Literal["explicit", "inferred"]
    source_refs: list[Text] = Field(min_length=1)


class Section(Contract):
    status: Literal["provided", "not_applicable", "not_provided", "not_analyzed"]
    items: list[Finding] = Field(default_factory=list)
    reason: Text | None = None

    @model_validator(mode="after")
    def check_status(self):
        if self.status == "provided":
            if not self.items:
                raise ValueError("provided section requires findings")
        elif self.items or not self.reason:
            raise ValueError("empty section requires a reason and no findings")
        return self


class Unknown(Contract):
    question: Text
    impact: Text
    blocking: bool
    source_refs: list[Text] = Field(min_length=1)


class UnderstandingData(Contract):
    objective_scope: Section
    roles_flows_conditions: Section
    rules_data_states: Section
    exceptions_boundaries: Section
    security_nonfunctional: Section
    dependencies_impacts: Section
    risks_testability: Section
    handoff: Section
    unknowns: list[Unknown]

    def render_markdown(self, locale: str | None = None) -> str:
        zh = locale == "zh-CN"
        titles = dict(zip(
            [name for name in type(self).model_fields if name != "unknowns"],
            ["业务目标与范围", "角色、流程与前后置条件", "规则、数据与状态", "异常与边界",
             "权限与非功能要求", "依赖与初步影响", "初步风险与可测试性", "后续分析交接"],
        ))
        labels = {"provided": "已提供", "not_applicable": "不适用", "not_provided": "未提供",
                  "not_analyzed": "未分析", "explicit": "明确事实", "inferred": "有依据的推断"}
        lines = ["# 测试工程师需求理解" if zh else "# Requirement Understanding"]
        for name in type(self).model_fields:
            if name == "unknowns":
                continue
            section = getattr(self, name)
            lines.extend(["", f"## {titles[name] if zh else name}",
                          f"状态：{labels[section.status]}" if zh else f"Status: {section.status}"])
            if section.reason:
                lines.append(section.reason)
            for finding in section.items:
                lines.append(f"- [{labels[finding.basis] if zh else finding.basis}] {finding.text} ({'来源' if zh else 'sources'}: {', '.join(finding.source_refs)})")
        lines.extend(["", "## 待确认问题" if zh else "## Unknowns"])
        for item in self.unknowns:
            blocking = f"阻塞：{'是' if item.blocking else '否'}" if zh else f"blocking={item.blocking}"
            lines.append(f"- {item.question} — {item.impact}; {blocking} ({'来源' if zh else 'sources'}: {', '.join(item.source_refs)})")
        return "\n".join(lines)


class SourceSnapshot(Contract):
    ref: Text
    version: Text | None = None
    content: str
    sha256: str

    @classmethod
    def capture(cls, ref: str, content: str, version: str | None = None):
        return cls(ref=ref, content=content, version=version,
                   sha256=hashlib.sha256(content.encode("utf-8")).hexdigest())

    @model_validator(mode="after")
    def verify_hash(self):
        if self.sha256 != hashlib.sha256(self.content.encode("utf-8")).hexdigest():
            raise ValueError("source snapshot hash mismatch")
        return self


class UnderstandingArtifact(Contract):
    schema_version: Literal["1"] = "1"
    id: Text = Field(default_factory=lambda: str(uuid4()))
    revision: int = Field(default=1, ge=1)
    task_id: Text | None = None
    run_id: Text | None = None
    step_id: Text = "requirement_understand"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    requirement_id: Text
    model: Text
    locale: Text | None = None
    sources: list[SourceSnapshot] = Field(min_length=2)
    raw_response: str
    data: UnderstandingData | None = None
    validation_status: Literal["structured", "unvalidated"]
    validation_errors: list[str] = Field(default_factory=list)
    acceptance: Literal["pending"] = "pending"

    @model_validator(mode="after")
    def check_contract(self):
        if (self.validation_status == "structured") != (self.data is not None):
            raise ValueError("structured status requires structured data")
        refs = [source.ref for source in self.sources]
        if len(refs) != len(set(refs)):
            raise ValueError("duplicate source references")
        if self.data:
            used = [ref for name in type(self.data).model_fields if name != "unknowns"
                    for item in getattr(self.data, name).items for ref in item.source_refs]
            used += [ref for item in self.data.unknowns for ref in item.source_refs]
            if set(used) - {ref for ref in refs if not ref.startswith("template:")}:
                raise ValueError("unknown source references in structured data")
        return self

    @property
    def markdown(self) -> str:
        return self.data.render_markdown(self.locale) if self.data else self.raw_response

    def require_data(self) -> UnderstandingData:
        """Downstream stages must explicitly require a validated contract."""
        if self.validation_status != "structured" or self.data is None:
            raise ValueError("Requirement understanding has no validated structured data")
        return self.data

    def save_new(self, path: Path) -> None:
        content = self.model_dump_json(indent=2)
        with path.open("x", encoding="utf-8") as stream:
            stream.write(content)

    @classmethod
    def load(cls, path: Path):
        return cls.model_validate_json(path.read_text(encoding="utf-8"))


def decode_data(content: str) -> UnderstandingData:
    body = content.strip()
    if body.startswith("```json\n") and body.endswith("```"):
        body = body[8:-3].strip()
    return UnderstandingData.model_validate(json.loads(body))
