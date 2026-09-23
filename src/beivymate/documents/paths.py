"""Path selection is explicit and never falls back after a chosen path fails."""
from pathlib import Path


def output_root(default: Path, *, task=None, workspace=None, user=None) -> Path:
    base = default.expanduser().resolve()
    selected = next((value for value in (task, workspace, user) if value), None)
    path = Path(selected).expanduser() if selected else base
    if not path.is_absolute():
        path = base / path
    path = path.resolve()
    repository = Path(__file__).resolve().parents[3]
    if path.is_relative_to(repository):
        raise ValueError('客户产物不能保存到源码或安装目录，请选择项目之外的目录')
    path.mkdir(parents=True, exist_ok=True)
    return path
