"""M7 case definitions and design proposals; execution plans are separate."""
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from pydantic import Field, model_validator
from beivymate.model.artifact.requirement_understanding import Contract, Text, SourceSnapshot


class FunctionNode(Contract):
    id: Text
    product_id: Text
    name: Text
    parent_id: Text | None = None


class ProductCatalog(Contract):
    products: dict[Text, Text]  # product ID -> globally unique asset code, e.g. Func01
    functions: list[FunctionNode]

    @model_validator(mode='after')
    def validate_tree(self):
        import re
        if len(set(self.products.values())) != len(self.products):
            raise ValueError('Product asset codes must be unique')
        if any(not re.fullmatch(r'[A-Za-z][A-Za-z0-9]*', code) for code in self.products.values()):
            raise ValueError('Asset codes must contain only letters and digits')
        nodes = {node.id: node for node in self.functions}
        if len(nodes) != len(self.functions):
            raise ValueError('Function IDs must be unique')
        for node in self.functions:
            if node.product_id not in self.products:
                raise ValueError('Unknown product')
            seen = {node.id}
            parent = node.parent_id
            while parent:
                if parent not in nodes or nodes[parent].product_id != node.product_id or parent in seen:
                    raise ValueError('Invalid function parent or cycle')
                seen.add(parent)
                parent = nodes[parent].parent_id
        return self

    def check_function(self, product_id, function_id):
        if product_id not in self.products:
            raise ValueError('Unknown product')
        if function_id is not None and not any(n.id == function_id and n.product_id == product_id for n in self.functions):
            raise ValueError('Function does not belong to product')


class CaseStep(Contract):
    description: Text
    expected_result: Text
    special_data: str = ''


class CaseContent(Contract):
    title: Text
    description: Text
    preconditions: Text
    priority: Literal['P0', 'P1', 'P2', 'P3']
    steps: list[CaseStep] = Field(min_length=1)
    product_id: Text
    function_id: Text | None = None
    related_function_ids: list[Text] = Field(default_factory=list)
    project_id: Text | None = None
    applicable_versions: list[Text] = Field(min_length=1)
    condition_refs: list[Text] = Field(min_length=1)
    notes: str = ''
    blocking_questions: list[Text] = Field(default_factory=list)


class CaseProposal(CaseContent):
    action: Literal['new', 'reuse', 'revise', 'retire', 'discard'] = 'new'
    existing_id: Text | None = None
    existing_revision: int | None = Field(default=None, ge=1)
    change_reason: Text

    @model_validator(mode='after')
    def check_reference(self):
        if self.action == 'new':
            if self.existing_id is not None or self.existing_revision is not None:
                raise ValueError('New case cannot reference an existing identity')
        elif self.existing_id is None or self.existing_revision is None:
            raise ValueError('Existing case action requires identity and revision')
        return self


class UncoveredCondition(Contract):
    condition_ref: Text
    reason: Text


class DesignData(Contract):
    cases: list[CaseProposal]
    uncovered: list[UncoveredCondition]
    summary: Text


class CasePublication(Contract):
    requirement_id: Text
    requirement_version: Text
    product_version: Text
    actor: Text
    published_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CaseRevision(CaseContent):
    id: Text = Field(default_factory=lambda: str(uuid4()))
    number: Text
    revision: int = Field(default=1, ge=1)
    author: Text
    modified_by: Text
    maintainer: Text
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    lifecycle: Literal['active', 'retired', 'discarded'] = 'active'
    review_status: Literal['draft', 'accepted'] = 'draft'
    automation_refs: list[Text] = Field(default_factory=list)
    design_id: Text
    external_refs: dict[Text, Text] = Field(default_factory=dict)

    publications: list[CasePublication] = Field(default_factory=list)

    publication_status: Literal['unpublished', 'published'] = 'unpublished'

    @model_validator(mode='after')
    def derive_publication_status(self):
        self.publication_status = 'published' if self.publications else 'unpublished'
        return self

    @property
    def automated(self):
        return bool(self.automation_refs)


class DesignArtifact(Contract):
    schema_version: Literal['1'] = '1'
    id: Text = Field(default_factory=lambda: str(uuid4()))
    revision: int = Field(default=1, ge=1)
    step_id: Text
    task_id: Text | None = None
    run_id: Text | None = None
    analysis_id: Text
    analysis_revision: int = Field(ge=1)
    analysis_hash: Text
    sources: list[SourceSnapshot]
    raw_response: str
    proposals: DesignData
    case_revisions: list[CaseRevision]
    # Stable condition references use accepted artifact identity/revision and item position.
    coverage: dict[str, list[str]]
    inherited_unknowns: list[str]
    review_warnings: list[str] = Field(default_factory=list)
    model: Text
    locale: Text | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def require_data(self):
        return self.proposals

    @property
    def markdown(self):
        counts = {action: sum(c.action == action for c in self.proposals.cases)
                  for action in ('new', 'reuse', 'revise', 'retire', 'discard')}
        lines = ['# 测试设计总结', '', self.proposals.summary, '',
                 '变更统计：' + ', '.join(f'{k}={v}' for k,v in counts.items()),
                 f'测试条件：{len(self.coverage)}；未覆盖：{sum(not ids for ids in self.coverage.values())}', '',
                 '## 用例清单']
        lines += [f'- {c.number} r{c.revision}：{c.title} [{c.review_status}/{c.lifecycle}]' for c in self.case_revisions]
        lines += ['', '## 本次用例待确认问题']
        for proposal, case in zip(self.proposals.cases, self.case_revisions):
            lines += [f'- {case.number}: {question}' for question in proposal.blocking_questions]
        lines += ['', '## 未覆盖原因'] + [f'- {x.condition_ref}: {x.reason}' for x in self.proposals.uncovered]
        lines += ['', '## 上游待确认问题'] + [f'- {q}' for q in self.inherited_unknowns]
        lines += ['', '## 待审阅提示（条件引用不代表业务覆盖充分）'] + [f'- {w}' for w in self.review_warnings]
        return '\n'.join(lines)

    def save_new(self, path):
        with path.open('x', encoding='utf-8') as stream:
            stream.write(self.model_dump_json(indent=2))
