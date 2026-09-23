from pathlib import Path

from beivymate.runtime.context import AgentContext
from beivymate.runtime.runtime import Runtime
from beivymate.runtime.skill import Skill
from beivymate.runtime.skill_registry import SkillRegistry


class RecordingSkill(Skill):

    def __init__(
        self,
        records: list[str],
    ) -> None:

        self._records = records

    def execute(
        self,
        context: AgentContext,
    ) -> None:

        self._records.append("executed")


def test_runtime_loads_user_workflow(
    tmp_path: Path,
):

    workflow_file = tmp_path / "smoke_test.md"

    workflow_file.write_text(
        """---
        id: smoke_test
        name: Smoke Test
        description: Test workflow.
        ---

## 步骤：understand
- 技能：requirement_understand
        """,
        encoding="utf-8",
    )

    records: list[str] = []

    registry = SkillRegistry()

    registry.register(
        "requirement_understand",
        RecordingSkill(records),
    )

    runtime = Runtime(
        skill_registry=registry,
    )

    workflow = runtime.load_workflow(
        str(workflow_file)
    )

    context = runtime._execute(
        workflow=workflow,
    )

    assert workflow.definition.id == "smoke_test"
    assert len(workflow.skills) == 1
    assert records == ["executed"]