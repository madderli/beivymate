from pathlib import Path
from textwrap import dedent
import pytest

from beivymate.runtime.workflow import WorkflowDefinition
from beivymate.runtime.workflow_parser import WorkflowParser

WORKFLOW_PATH = Path(__file__).parents[1] / "fixtures" / "workflow.md"

def test_parse_workflow_markdown() -> None:
    definition = WorkflowParser.parse(WORKFLOW_PATH)

    assert isinstance(definition, WorkflowDefinition)

    assert definition.id == "workflow"

    assert definition.name == "Standard Testing Flow"

    assert (
        definition.description
        == "Standard software testing workflow for MVP."
    )

    assert definition.skill_ids == [
        "tester_requirement_understanding",
        "test_analysis",
        "test_design",
        "test_execution",
        "test_report",
    ]

def test_parse_workflow_without_steps(tmp_path: Path) -> None:
    workflow_path = tmp_path / "workflow.md"
    print(workflow_path)

    workflow_path.write_text(
        dedent(
            """
            # Test Workflow

            ## Description

            Test workflow.
            """
        ).strip(),
        encoding = "utf-8",
    )

    with pytest.raises(
        ValueError,
        match = "Workflow steps are missing",
    ):
        WorkflowParser.parse(workflow_path)