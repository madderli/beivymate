from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class OutputPolicy(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: str = Field(pattern=r'^[a-z][a-z0-9_]*$')
    filename: str = Field(pattern=r'^[A-Za-z0-9_-]+\.(md|json|xlsx|docx|html|png|txt)$')
    required: bool = True
    scope: Literal['task', 'workspace', 'product', 'project'] = 'task'
    asset: bool = False
    editable: bool = True
    knowledge: Literal['none', 'ask'] = 'ask'


class DocumentOrigin(BaseModel):
    model_config = ConfigDict(extra='forbid')
    workspace: str = Field(min_length=1)
    task: str = Field(min_length=1)
    run: str = Field(min_length=1)
    step: str = Field(min_length=1)
    skill: str = Field(min_length=1)
    product: str | None = None
    project: str | None = None
    function: str | None = None
    function_path: list[str] = Field(default_factory=list)
    source_asset_id: str | None = None
    source_asset_revision: int | None = Field(default=None, ge=1)
    rounds: list[int] = Field(default_factory=list)
    responsible: str = Field(min_length=1)
    executor: str = Field(min_length=1)


class DocumentRef(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: str
    revision: int = Field(ge=1)
    sha256: str = Field(pattern=r'^[a-f0-9]{64}$')


class KnowledgeTarget(BaseModel):
    model_config = ConfigDict(extra='forbid')
    scope: Literal['product', 'project']
    product: str = Field(min_length=1)
    project: str | None = None
    versions: list[str] = Field(min_length=1)
    operation: Literal['add', 'modify', 'retire', 'exception'] = 'add'
    supersedes: list[str] = Field(default_factory=list)

    @model_validator(mode='after')
    def scope_check(self):
        if (self.scope == 'project') != bool(self.project):
            raise ValueError('项目知识必须指定项目，产品通用知识不能指定项目')
        return self
