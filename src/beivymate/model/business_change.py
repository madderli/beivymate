"""Version-specific business history; never inferred from task completion."""
from datetime import datetime
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Text = Annotated[str, Field(min_length=1)]


class BusinessChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: Text
    revision: int = Field(default=1, ge=1)
    requirement_id: Text
    requirement_version: Text
    product_id: Text
    scope: Literal["product", "project"]
    project_id: Text | None = None
    affected_objects: list[Text] = Field(min_length=1)
    operation: Literal["add", "modify", "retire", "exception"]
    content: Text
    applicable_versions: list[Text] = Field(min_length=1)
    status: Literal["proposed", "confirmed", "effective", "withdrawn"] = "proposed"
    confirmed_by: Text | None = None
    confirmed_at: datetime | None = None
    evidence_refs: list[Text] = Field(default_factory=list)
    supersedes: list[Text] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_scope_and_evidence(self):
        if (self.scope == "project") != (self.project_id is not None):
            raise ValueError("project scope requires project_id; product scope forbids it")
        if self.status in {"confirmed", "effective"}:
            if not self.confirmed_by or not self.confirmed_at:
                raise ValueError("confirmed changes require a human confirmation record")
        if self.status == "effective" and not self.evidence_refs:
            raise ValueError("effective changes require delivery evidence")
        return self

    def save_new(self, path: Path) -> None:
        """Append history as a new file; never overwrite a previous revision."""
        with path.open("x", encoding="utf-8") as stream:
            stream.write(self.model_dump_json(indent=2))

    @classmethod
    def load(cls, path: Path) -> "BusinessChange":
        return cls.model_validate_json(path.read_text(encoding="utf-8"))


def select_effective_changes(changes: list[BusinessChange], product_id: str,
                             version: str, project_id: str | None = None) -> list[BusinessChange]:
    """Return applicable facts without silently resolving conflicting rules."""
    latest: dict[str, BusinessChange] = {}
    for change in changes:
        if change.product_id != product_id or version not in change.applicable_versions:
            continue
        old = latest.get(change.id)
        if old and old.revision == change.revision and old != change:
            raise ValueError("Conflicting business change revision")
        if old is None or change.revision > old.revision:
            latest[change.id] = change
    return [change for change in latest.values()
            if change.status == "effective" and change.product_id == product_id
            and version in change.applicable_versions
            and (change.scope == "product" or change.project_id == project_id)]
