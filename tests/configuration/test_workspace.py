from datetime import datetime, timezone
from pathlib import Path
import shutil

import pytest
from pydantic import ValidationError

from beivymate.configuration.workspace import TaskDefinition, load_configuration, load_task_bundle
from beivymate.model.business_change import BusinessChange, select_effective_changes
from beivymate.model.run import RunRecord


@pytest.fixture
def task_path(tmp_path):
    source = Path(__file__).resolve().parents[2] / "resources/examples/workspace"
    shutil.copytree(source, tmp_path / "workspace")
    return tmp_path / "workspace/tasks/payment/task.md"


def test_bundle_paths_independent_of_cwd_and_snapshot_survives_edit(task_path, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    snapshot = load_task_bundle(task_path)
    assert snapshot[str(task_path)]["runs_path"] == str(task_path.parent / "runs")
    record = RunRecord(task_id="TASK-PAY-001", configuration_snapshot=snapshot)
    output = tmp_path / "run.json"
    record.save_new(output)
    task_path.write_text("changed", encoding="utf-8")
    assert RunRecord.load(output) == record
    with pytest.raises(FileExistsError):
        record.save_new(output)


@pytest.mark.parametrize("old,new,error", [
    ('project_id: hospital-a', 'project_id: hospital-b', '归属不匹配'),
    ('baseline_version: "1.0"\n', '', 'baseline_version'),
    ('environment: ../../functional.md', 'environment: other.md', '未在目标 Workspace 注册'),
])
def test_invalid_target_is_rejected(task_path, old, new, error):
    target = task_path.parent / "target.md"
    target.write_text(target.read_text().replace(old, new), encoding="utf-8")
    with pytest.raises(ValueError, match=error):
        load_task_bundle(task_path)


def test_customer_typo_names_file_and_field(task_path):
    task_path.write_text(task_path.read_text().replace('review_mode:', 'review_mod:'))
    with pytest.raises(ValueError, match='review_mod') as error:
        load_configuration(task_path, TaskDefinition)
    assert str(task_path) in str(error.value)


def change(**updates):
    data = dict(id="CHANGE-1", requirement_id="REQ-1", requirement_version="1",
                product_id="payment", scope="product", affected_objects=["payment-state"],
                operation="modify", content="支付成功更新状态", applicable_versions=["1.1"],
                status="effective", confirmed_by="reviewer", confirmed_at=datetime.now(timezone.utc),
                evidence_refs=["release-1.1"])
    data.update(updates)
    return BusinessChange(**data)


def test_business_history_isolated_by_project_version_and_delivery():
    common = change()
    project = change(id="CHANGE-2", scope="project", project_id="hospital-a")
    proposed = change(id="CHANGE-3", status="proposed")
    records = [common, project, proposed]
    assert select_effective_changes(records, "payment", "1.1", "hospital-a") == [common, project]
    assert select_effective_changes(records, "payment", "1.1", "hospital-b") == [common]
    assert select_effective_changes(records, "payment", "1.0", "hospital-a") == []
    assert select_effective_changes(records, "other", "1.1") == []


@pytest.mark.parametrize("updates", [
    {"scope": "project"}, {"project_id": "hospital-a"},
    {"confirmed_by": None}, {"evidence_refs": []},
])
def test_business_change_requires_scope_and_confirmation(updates):
    with pytest.raises(ValidationError):
        change(**updates)


def test_business_history_persists_without_overwriting(tmp_path):
    record = change()
    path = tmp_path / "change-1-revision-1.json"
    record.save_new(path)
    assert BusinessChange.load(path) == record
    with pytest.raises(FileExistsError):
        record.save_new(path)
