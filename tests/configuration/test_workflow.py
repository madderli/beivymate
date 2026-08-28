from pathlib import Path

from beivymate.configuration.loader import load_workflow_definition
from beivymate.configuration.models import WorkflowDefinition


PROJECT_ROOT = Path(__file__).resolve().parents[2]

SMOKE_TEST_WORKFLOW = (
    PROJECT_ROOT
    / "resources"
    / "configuration"
    / "workflow"
    / "smoke_test.md"
)

UAT_WORKFLOW = (
    PROJECT_ROOT
    / "resources"
    / "configuration"
    / "workflow"
    / "uat.md"
)


def test_load_smoke_test_workflow():
    workflow = load_workflow_definition(SMOKE_TEST_WORKFLOW)

    assert isinstance(workflow, WorkflowDefinition)
    assert workflow.id == "smoke_test"
    assert workflow.name == "Smoke Test"
    assert workflow.description == "Default smoke test workflow."

    assert workflow.steps == [
        "tester_requirement_understanding",
    ]


def test_load_uat_workflow():
    workflow = load_workflow_definition(UAT_WORKFLOW)

    assert isinstance(workflow, WorkflowDefinition)
    assert workflow.id == "uat"
    assert workflow.name == "UAT"
    assert workflow.description == "Default user acceptance testing workflow."

    assert workflow.steps == [
        "tester_requirement_understanding",
        "test_analysis",
        "test_design",
        "test_execution",
        "test_report",
    ]