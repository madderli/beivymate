"""Single customer workflow format: metadata followed by explicit step sections."""
import re
from pathlib import Path
from beivymate.markdown.metadata import read_markdown
from beivymate.configuration.models import WorkflowDefinition, WorkflowStepDefinition

FIELDS = {'技能': 'skill', '输入': 'inputs', '分析策略': 'analysis_strategy',
          '结果确认': 'review_mode', '执行授权': 'authorization_mode'}
VALUES = {'简要': 'simple', '标准': 'standard', '深入': 'deep', '人工': 'manual', '自动': 'auto'}


def load_workflow(path: Path) -> WorkflowDefinition:
    metadata, body = read_markdown(path)
    if set(metadata) - {'id', 'name', 'description', 'imports'}:
        raise ValueError(f'{path}: 工作流只支持单文件步骤小节格式，不再支持 steps 或步骤文件引用')
    sections = re.split(r'^## 步骤：([^\n]+)\s*$', body, flags=re.M)
    steps = []
    for index in range(1, len(sections), 2):
        fields = {'id': sections[index].strip()}
        for line in sections[index + 1].splitlines():
            if not line.startswith('- '):
                continue
            name, separator, value = line[2:].partition('：')
            if not separator or name not in FIELDS:
                raise ValueError(f'{path}: 无效步骤字段 {line}')
            key = FIELDS[name]
            if key in fields:
                raise ValueError(f'{path}: 重复步骤字段 {name}')
            value = value.strip()
            fields[key] = [v.strip() for v in value.split('、') if v.strip()] if key == 'inputs' else VALUES.get(value, value)
        steps.append(WorkflowStepDefinition.model_validate(fields))
    if not steps:
        raise ValueError(f'{path}: 至少需要一个“## 步骤：标识”小节')
    return WorkflowDefinition(**metadata, steps=[s.skill for s in steps], step_definitions=steps)
