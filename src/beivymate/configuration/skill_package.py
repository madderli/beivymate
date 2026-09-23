"""Role-independent, validated Skill package definition; never imports customer code."""
from pathlib import Path
from typing import Literal
import hashlib
import re
from beivymate.documents.models import OutputPolicy
from pydantic import BaseModel, ConfigDict, Field, model_validator
from beivymate.markdown.metadata import read_markdown


class SkillDefinition(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: str = Field(pattern=r'^[a-z][a-z0-9_-]*$')
    name: str = Field(min_length=1)
    description: str = Field(min_length=1)
    role: str = Field(min_length=1)
    version: str = Field(min_length=1)
    executor: str = Field(min_length=1)
    model: str | None = None
    analysis_strategies: list[Literal['simple', 'standard', 'deep']] = Field(default_factory=list)
    default_analysis_strategy: Literal['simple', 'standard', 'deep'] | None = None
    inputs: list[str] = Field(min_length=1)
    outputs: list[str] = Field(min_length=1)
    output_policies: list[OutputPolicy] = Field(min_length=1)
    instructions: str = Field(min_length=1)

    @model_validator(mode='after')
    def defaults(self):
        if self.default_analysis_strategy is not None and self.default_analysis_strategy not in self.analysis_strategies:
            raise ValueError('默认分析策略必须属于该 Skill 支持的策略')
        if self.analysis_strategies and self.default_analysis_strategy is None:
            raise ValueError('支持分析的 Skill 必须声明默认分析策略')
        if self.output_policies:
            ids = [p.id for p in self.output_policies]
            if len(ids)!=len(set(ids)) or set(ids)!=set(self.outputs):
                raise ValueError('产物规则必须与 outputs 一一对应')
            if len({p.filename for p in self.output_policies})!=len(self.output_policies):
                raise ValueError('同一步骤的输出文件名不能重复')
        from beivymate.configuration.output_contracts import validate_outputs
        validate_outputs(self.executor, self.outputs, self.output_policies)
        return self


def load_skill(path: Path):
    if path.name != 'SKILL.md':
        raise ValueError('能力定义入口必须为 SKILL.md')
    from beivymate.configuration.integrity import verify_bundled
    verify_bundled(path)
    metadata, instructions = read_markdown(path)
    sections = re.split(r'^## 产物：([^\n]+)\s*$', instructions, flags=re.M)
    policies = []
    names={'文件名':'filename','必需':'required','归属':'scope','工作资产':'asset','允许编辑':'editable','知识沉淀':'knowledge'}
    values={'是':True,'否':False,'任务':'task','工作区':'workspace','产品':'product','项目':'project','询问':'ask','不适用':'none'}
    for i in range(1,len(sections),2):
        fields={'id':sections[i].strip()}
        for line in sections[i+1].splitlines():
            if line.startswith('## '):break
            if not line.startswith('- '):continue
            name,sep,value=line[2:].partition('：')
            if not sep or name not in names or names[name] in fields:raise ValueError('产物配置字段无效或重复：'+line)
            fields[names[name]]=values.get(value.strip(),value.strip())
        policies.append(OutputPolicy.model_validate(fields))
    if not policies:
        raise ValueError('每个 Skill 必须声明完整产物规则，不能省略产物小节')
    return SkillDefinition(**metadata, output_policies=policies, instructions=instructions)


class SkillCatalog:
    def __init__(self, builtin: Path, custom: Path | None = None):
        self.entries = {}
        for root in (builtin, custom):
            if root is None or not root.exists():
                continue
            for path in sorted(root.rglob('SKILL.md')):
                if not path.resolve().is_relative_to(root.resolve()):
                    raise ValueError('Skill 引用超出配置目录')
                definition = load_skill(path)
                if definition.id in self.entries:
                    raise ValueError(f'Skill 标识重复：{definition.id}；客户副本必须有独立标识')
                self.entries[definition.id] = (definition, path)

    def get(self, identity):
        if identity not in self.entries:
            raise ValueError(f'未找到 Skill：{identity}')
        return self.entries[identity][0]

    def snapshot(self, identity):
        definition, path = self.entries[identity]
        # Capture package bytes, including optional binary templates, by hash.
        files = {}
        for file in sorted(path.parent.rglob('*')):
            if file.is_file() and not any(part.startswith('.') for part in file.relative_to(path.parent).parts):
                if not file.resolve().is_relative_to(path.parent.resolve()):
                    raise ValueError('Skill 资源引用超出包目录')
                from beivymate.configuration.integrity import verify_bundled
                verify_bundled(file)
                files[str(file.relative_to(path.parent))] = hashlib.sha256(file.read_bytes()).hexdigest()
        return {'definition': definition.model_dump(), 'files': files}
