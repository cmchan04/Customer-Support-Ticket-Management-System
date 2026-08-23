from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from ticket_ml.deployment import promote_merged_models


def _write_model(directory: Path, family: str, version: str, marker: str) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    files = ("joint_pipeline.joblib",) if family == "joint" else (
        "queue_pipeline.joblib",
        "priority_pipeline.joblib",
    )
    for name in files:
        (directory / name).write_bytes(f"{marker}:{name}".encode())
    results = (
        {"selected_model": "linear_svm_joint_by_type"}
        if family == "joint"
        else {
            "queue": {"selected_model": "linear_svm_by_type"},
            "priority": {"selected_model": "linear_svm_by_type"},
        }
    )
    (directory / "metadata.json").write_text(
        json.dumps(
            {
                "trained_at_utc": version,
                "config": {"queue_label_map": {"IT Support": "Technical Support"}},
                "results": results,
            }
        ),
        encoding="utf-8",
    )


def test_promote_merged_models_archives_each_family_by_training_method(tmp_path):
    model_root = tmp_path / "workspace" / "artifacts" / "models"
    separate_source = model_root / "experiments" / "merge_it_technical"
    joint_source = model_root / "experiments" / "merge_it_technical_joint"
    _write_model(separate_source, "separate", "2026-08-22T14:12:48+00:00", "new-separate")
    _write_model(joint_source, "joint", "2026-08-22T15:12:10+00:00", "new-joint")
    _write_model(model_root, "separate", "2026-08-21T11:04:14+00:00", "old-separate")
    _write_model(model_root / "joint", "joint", "2026-08-21T11:36:40+00:00", "old-joint")

    results = promote_merged_models(
        model_root=model_root,
        now=datetime(2026, 8, 22, 16, 0, tzinfo=UTC),
    )

    assert [result.family for result in results] == ["separate", "joint"]
    assert results[0].archive_directory.is_relative_to(
        tmp_path / "workspace" / "archive" / "model_deployment"
    )
    assert results[1].archive_directory.is_relative_to(
        tmp_path / "workspace" / "archive" / "model_deployment"
    )
    assert "linear_svm_by_type" in results[0].archive_directory.name
    assert "linear_svm_joint_by_type" in results[1].archive_directory.name
    assert (model_root / "queue_pipeline.joblib").read_bytes().startswith(b"new-separate")
    assert (model_root / "joint" / "joint_pipeline.joblib").read_bytes().startswith(b"new-joint")
    assert (
        results[0].archive_directory / "queue_pipeline.joblib"
    ).read_bytes().startswith(b"old-separate")
    assert (
        results[1].archive_directory / "joint_pipeline.joblib"
    ).read_bytes().startswith(b"old-joint")
    deployed_metadata = json.loads((model_root / "metadata.json").read_text())
    assert deployed_metadata["deployment"]["status"] == "fixed_deployment"
    assert deployed_metadata["deployment"]["family"] == "separate"
    assert (results[0].archive_directory / "promotion_manifest.json").is_file()
