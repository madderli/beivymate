"""Resolve a Skill model reference without falling back on a broken override."""
from pathlib import Path
from beivymate.configuration.loader import load_model_definition


def resolve_model(identity: str, root: Path, extra_root: Path | None = None):
    paths = list(root.glob('*.md')) + (list(extra_root.glob('*.md')) if extra_root else [])
    definitions = [load_model_definition(path) for path in sorted(paths)]
    matches = [item for item in definitions if item.id == identity]
    if len(matches) != 1:
        raise ValueError('模型配置不存在或标识重复：' + identity)
    config = matches[0]
    if not config.enabled or not config.base_url:
        raise ValueError('模型未启用或缺少服务地址：' + identity)
    from beivymate.application.app import create_gateway
    gateway = create_gateway(provider=config.provider, base_url=config.base_url,
        timeout=config.timeout, api_key_env=config.api_key_env, max_retries=config.max_retries)
    return gateway, config.model
