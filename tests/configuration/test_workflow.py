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
    assert workflow.name == "冒烟测试准备（需求理解）"
    assert workflow.description == "仅完成冒烟测试前的需求理解，不执行测试。"

    assert workflow.steps == [
        "requirement_understand",
    ]


def test_load_uat_workflow():
    workflow = load_workflow_definition(UAT_WORKFLOW)

    assert isinstance(workflow, WorkflowDefinition)
    assert workflow.id == "uat"
    assert workflow.name == "用户验收测试"
    assert workflow.description == "从需求理解到测试报告的用户验收流程。"

    assert workflow.steps == [
        "requirement_understand",
        "test_analysis",
        "test_design",
        "test_execution",
        "test_report",
    ]