"""Shared local-client paths. No implicit writes into the installation tree."""
from dataclasses import dataclass
import os
from pathlib import Path
import shutil


def data_directory():
    return Path(os.environ.get('BEIVYMATE_DATA_DIR', str(Path.home() / '.beivymate'))).expanduser().resolve()


@dataclass(frozen=True)
class AppPaths:
    root: Path
    skills_override: Path | None = None

    def __post_init__(self):
        object.__setattr__(self, 'root', self.root.expanduser().resolve())
        if self.skills_override is not None:
            object.__setattr__(self, 'skills_override', self.skills_override.expanduser().resolve())

    @property
    def builtin(self):
        return Path(__file__).resolve().parents[1] / 'builtin'

    @property
    def skills(self):
        return self.skills_override or self.root / 'skills'

    @property
    def workflows(self):
        return self.root / 'configuration/workflows'

    @property
    def models(self):
        return self.root / 'configuration/models'

    @property
    def work(self):
        return self.root / 'work'

    @property
    def registry(self):
        return self.work / 'resource-registry.sqlite3'

    def migrate_skills(self):
        """Copy legacy packages; never overwrite destinations or delete originals."""
        source = self.root / 'configuration/skills'
        reports = []
        if not source.exists() or source.resolve() == self.skills:
            return reports
        self.skills.mkdir(parents=True, exist_ok=True)
        for directory in sorted(source.iterdir()):
            if directory.name.startswith('.') or not directory.is_dir():
                continue
            target = self.skills / directory.name
            if target.exists():
                from hashlib import sha256
                def manifest(root):
                    return {str(p.relative_to(root)): sha256(p.read_bytes()).hexdigest()
                            for p in root.rglob('*') if p.is_file() and not p.is_symlink()}
                if target.is_symlink() or manifest(directory) != manifest(target):
                    reports.append(f'迁移冲突，目标目录已有不同内容，未覆盖；源文件保留：{directory}')
                continue
            if directory.is_symlink() or any(p.is_symlink() for p in directory.rglob('*')):
                reports.append(f'未迁移含符号链接的旧技能包：{directory}')
                continue
            import tempfile
            with tempfile.TemporaryDirectory(dir=self.skills, prefix='.migration-') as temporary:
                staging = Path(temporary) / directory.name
                shutil.copytree(directory, staging)
                from hashlib import sha256
                for path in directory.rglob('*'):
                    if path.is_file() and sha256(path.read_bytes()).digest() != sha256((staging/path.relative_to(directory)).read_bytes()).digest():
                        raise OSError('旧技能包复制校验失败：' + str(directory))
                if target.exists():
                    reports.append(f'迁移目标已存在，保留原目录：{directory}')
                    continue
                staging.rename(target)
            reports.append(f'已复制旧技能包，源文件保留：{directory}')
        return reports
