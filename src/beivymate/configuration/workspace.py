"""Customer-editable, shallow Markdown configuration contracts."""
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from beivymate.markdown.metadata import read_markdown

Text = Annotated[str, Field(min_length=1)]


class Configuration(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: Literal["1"] = "1"


class EnvironmentDefinition(Configuration):
    id: Text
    name: Text
    product_id: Text
    project_id: Text | None = None
    kind: Literal["smoke", "functional", "uat", "other"]
    endpoint: Text


class WorkspaceDefinition(Configuration):
    id: Text
    name: Text
    product_ids: list[Text] = Field(min_length=1)
    project_id: Text | None = None
    environments: list[Text] = Field(default_factory=list)
    knowledge_paths: list[Text] = Field(default_factory=list)
    asset_paths: list[Text] = Field(default_factory=list)


class TargetDefinition(Configuration):
    workspace: Text
    product_id: Text
    project_id: Text | None = None
    baseline_version: Text | None = None
    target_version: Text
    environment: Text


class TaskDefinition(Configuration):
    id: Text
    name: Text
    type: Literal["requirement", "incremental", "defect", "regression"]
    workspace: Text
    workflow: Text
    targets: list[Text] = Field(min_length=1)
    inputs: list[Text] = Field(min_length=1)
    output_locale: Text = "zh-CN"
    test_cases_path: Text
    runs_path: Text
    analysis_strategy: Literal["simple", "standard", "deep"] = "standard"
    review_mode: Literal["manual", "auto"] = "manual"


def resolve_path(source: Path, value: str) -> Path:
    """All references are relative to their declaring file, never cwd."""
    path = Path(value)
    return (path if path.is_absolute() else source.parent / path).resolve()


def load_configuration(path: Path, model: type[Configuration]):
    metadata, _ = read_markdown(path)
    try:
        return model.model_validate(metadata)
    except ValidationError as exc:
        fields = "; ".join(
            f"{'.'.join(map(str, error['loc']))}: {error['msg']}"
            for error in exc.errors()
        )
        raise ValueError(f"配置文件 {path} 无效，请检查字段：{fields}") from exc


def load_task_bundle(path: Path) -> dict[str, dict]:
    """Validate references and return a JSON-serializable configuration snapshot.

    Output directories need not exist. This function never creates them.
    Workflow execution and step policies remain the Runtime's responsibility.
    """
    from beivymate.configuration.loader import load_workflow_definition

    snapshot: dict[str, dict] = {}

    def read(source: Path, model):
        source = source.resolve()
        value = load_configuration(source, model)
        snapshot[str(source)] = value.model_dump(mode="json")
        return value

    def workspace(source: Path):
        value = read(source, WorkspaceDefinition)
        for ref in value.knowledge_paths + value.asset_paths:
            if not resolve_path(source, ref).exists():
                raise ValueError(f"{source}: 知识或资产路径不存在：{ref}")
        for ref in value.environments:
            env = read(resolve_path(source, ref), EnvironmentDefinition)
            if env.product_id not in value.product_ids or env.project_id != value.project_id:
                raise ValueError(f"{source}: 环境 {env.id} 的产品或项目归属不匹配")
        return value

    path = path.resolve()
    task = read(path, TaskDefinition)
    workspace(resolve_path(path, task.workspace))
    flow_path = resolve_path(path, task.workflow)
    snapshot[str(flow_path)] = load_workflow_definition(flow_path).model_dump(mode="json")
    for ref in task.inputs:
        source = resolve_path(path, ref)
        snapshot[str(source)] = {"content": source.read_text(encoding="utf-8")}
    for ref in task.targets:
        target_path = resolve_path(path, ref)
        target = read(target_path, TargetDefinition)
        ws_path = resolve_path(target_path, target.workspace)
        ws = workspace(ws_path)
        env_path = resolve_path(target_path, target.environment)
        if env_path not in {resolve_path(ws_path, item) for item in ws.environments}:
            raise ValueError(f"{target_path}: 环境未在目标 Workspace 注册")
        env = read(env_path, EnvironmentDefinition)
        if (target.product_id not in ws.product_ids or target.product_id != env.product_id
                or target.project_id != ws.project_id or target.project_id != env.project_id):
            raise ValueError(f"{target_path}: 产品或项目归属不匹配")
        if task.type == "incremental" and target.baseline_version is None:
            raise ValueError(f"{target_path}: 增量测试必须提供 baseline_version")
    snapshot[str(path)]["test_cases_path"] = str(resolve_path(path, task.test_cases_path))
    snapshot[str(path)]["runs_path"] = str(resolve_path(path, task.runs_path))
    return snapshot
