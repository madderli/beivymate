from pathlib import Path


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
            / locale
            / "DefaultTesterRequirementUnderstandingTemplate.md"
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