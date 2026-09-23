"""Editable portal drafts, before M04 resolves a Runtime task bundle.

These describe the user's planning form, not Run state. Lifecycle, ownership,
IDs, attachment handles and group membership are server-owned records.
"""
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator


class Draft(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: str = Field(pattern=r'^[A-Za-z0-9_-]{1,80}$')

    @field_validator('*', mode='before')
    @classmethod
    def clean(cls, value, info):
        if isinstance(value, str):
            if info.field_name != 'description' and ('\n' in value or '\r' in value):
                raise ValueError('请使用单行内容')
            if '\x00' in value:
                raise ValueError('不能包含空字符')
            return value.strip()
        return value


class WorkspaceDraft(Draft):
    name: str = Field(min_length=1, max_length=120)
    subtitle: str = Field(default='', max_length=2000)
    knowledge: str = Field(default='', max_length=4000)
    product: str = Field(default='', max_length=120)
    project: str = Field(default='', max_length=120)


class TaskDraft(Draft):
    title: str = Field(min_length=1, max_length=200)
    workspace: str = Field(min_length=1, max_length=80)
    workflow: str = Field(min_length=1, max_length=120)
    description: str = Field(default='', max_length=100000)
    version: str = Field(min_length=1, max_length=120)
    environment: str = Field(default='', max_length=500)
    locale: Literal['zh-CN', 'en-US'] = 'zh-CN'
    taskType: Literal['requirement', 'incremental', 'defect', 'regression'] = 'requirement'
    analysisStrategy: Literal['simple', 'standard', 'deep'] = 'standard'
    reviewMode: Literal['manual', 'auto'] = 'manual'
    testCasesPath: str = Field(default='', max_length=500)
