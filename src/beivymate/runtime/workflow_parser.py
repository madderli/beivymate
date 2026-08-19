from pathlib import Path
import re

from beivymate.runtime.workflow import WorkflowDefinition

# Parse a Markdown workflow definition into a WorkflowDefinition object.
class WorkflowParser:

    @staticmethod
    def parse(path: Path) -> WorkflowDefinition:
        content = path.read_text(encoding="utf-8")

        name = WorkflowParser._parse_name(content)
        description = WorkflowParser._parse_description(content)
        skill_ids = WorkflowParser._parse_steps(content)

        workflow_id = path.stem

        return WorkflowDefinition(
            id = workflow_id,
            name = name,
            description = description,
            skill_ids = skill_ids,
        )

    @staticmethod
    def _parse_name(content: str) -> str:
        match = re.search(
            r"^#\s+(.+?)\s*$",
            content,
            re.MULTILINE,
        )

        if not match:
            raise ValueError("Workflow name is missing.")

        return match.group(1)

    @staticmethod
    def _parse_description(content: str) -> str:
        match = re.search(
            r"^##\s+Description\s*$"
            r"(.*?)"
            r"(?=^##\s+|\Z)",
            content,
            re.MULTILINE | re.DOTALL,
        )

        if not match:
            return ""

        return match.group(1).strip()

    @staticmethod
    def _parse_steps(content: str) -> list[str]:
        match = re.search(
            r"^##\s+Steps\s*$"
            r"(.*?)"
            r"(?=^##\s+|\Z)",
            content,
            re.MULTILINE | re.DOTALL,
        )

        if not match:
            raise ValueError("Workflow steps are missing.")

        steps: list[str] = []

        for line in match.group(1).splitlines():
            step_match = re.match(
                r"^\s*\d+\.\s+(.+?)\s*$",
                line,
            )

            if step_match:
                steps.append(step_match.group(1))

        if not steps:
            raise ValueError("Workflow must contain at least one step.")

        return steps