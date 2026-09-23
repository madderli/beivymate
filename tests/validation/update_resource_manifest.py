"""Maintainer-only release step: python tests/validation/update_resource_manifest.py."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / 'resources'
if __name__ == '__main__':
    files = [p for folder in ('skills','configuration/workflow') for p in (ROOT/folder).rglob('*') if p.is_file() and not any(part.startswith('.') for part in p.relative_to(ROOT).parts)]
    manifest = {str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files)}
    (ROOT/'builtin-manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
