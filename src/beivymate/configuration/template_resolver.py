from pathlib import Path


def default_template_filename(skill_id: str) -> str:
    if skill_id == 'requirement_understand':
        return 'RequirementUnderstandTemplate.md'
    return 'Default' + ''.join(part.capitalize() for part in skill_id.split('_')) + 'Template.md'


class TemplateResolver:

    def __init__(
        self,
        template_root: Path,
    ) -> None:

        self._template_root = template_root

    def resolve_default(
        self,
        role: str,
        template_name: str,
        locale: str = "zh-CN",
    ) -> Path:

        path = (
            self._template_root
            / role
            / template_name
            / "templates"
            / locale
            / default_template_filename(template_name)
        )

        if not path.exists():
            raise FileNotFoundError(
                f"Default template not found: {path}"
            )

        if not path.is_file():
            raise ValueError(
                f"Template path is not a file: {path}"
            )

        return path
