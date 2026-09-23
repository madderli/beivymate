"""Detect accidental modification of shipped configuration and templates.

This is an application integrity boundary, not protection against an OS administrator
who can replace both application code and its release manifest.
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3] / 'resources'


def verify_bundled(path: Path):
    resolved = path.resolve()
    if not any(resolved.is_relative_to(ROOT / part) for part in ('skills', 'configuration/workflow')):
        return
    try:
        manifest = json.loads((ROOT / 'builtin-manifest.json').read_text(encoding='utf-8'))
        expected = manifest[str(resolved.relative_to(ROOT))]
    except (OSError, ValueError, KeyError):
        raise ValueError('系统资源清单缺失或资源未登记，请恢复发行版本') from None
    if hashlib.sha256(resolved.read_bytes()).hexdigest() != expected:
        raise ValueError('系统默认资源已被修改，请恢复发行版本并使用客户副本：' + str(path.name))
