"""Maintainer-only release step: python tests/validation/update_resource_manifest.py."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / 'resources'
def build_manifest():
    manifest = {}
    roots = [(ROOT / 'configuration/workflow', 'configuration/workflow'),
             (ROOT.parent / 'src/beivymate/builtin/skills', 'skills')]
    for directory, prefix in roots:
        for path in sorted(directory.rglob('*')):
            relative = path.relative_to(directory)
            if not path.is_file() or any(part.startswith('.') for part in relative.parts) or relative == Path('README.md'):
                continue
            manifest[prefix + '/' + relative.as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    return dict(sorted(manifest.items()))


if __name__ == '__main__':
    (ROOT / 'builtin-manifest.json').write_text(json.dumps(build_manifest(), indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
