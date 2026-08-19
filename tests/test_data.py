from __future__ import annotations

import pandas as pd
import pytest

from ticket_ml.config import TrainingConfig
from ticket_ml.data import DataValidationError, load_and_prepare


def _config(path, tmp_path):
    return TrainingConfig(
        dataset_path=path,
        artifact_dir=tmp_path / "models",
        report_dir=tmp_path / "reports",
        cache_dir=tmp_path / "cache",
    )


def test_prepare_filters_language_fills_subject_and_deduplicates(tmp_path):
    path = tmp_path / "tickets.csv"
    pd.DataFrame(
        [
            {
                "subject": None,
                "body": "English body",
                "type": "Incident",
                "queue": "A",
                "priority": "high",
                "language": "en",
            },
            {
                "subject": "Duplicate",
                "body": "Same",
                "type": "Request",
                "queue": "A",
                "priority": "low",
                "language": "en",
            },
            {
                "subject": "Duplicate",
                "body": "Same",
                "type": "Request",
                "queue": "A",
                "priority": "low",
                "language": "en",
            },
            {
                "subject": "German",
                "body": "Text",
                "type": "Incident",
                "queue": "B",
                "priority": "low",
                "language": "de",
            },
            {
                "subject": "Empty",
                "body": "",
                "type": "Incident",
                "queue": "A",
                "priority": "low",
                "language": "en",
            },
        ]
    ).to_csv(path, index=False)

    prepared = load_and_prepare(_config(path, tmp_path))

    assert len(prepared.features) == 2
    assert prepared.features.iloc[0]["subject"] == ""
    assert prepared.features.iloc[0]["type"] == "Incident"
    assert prepared.summary["duplicates_removed"] == 1
    assert prepared.summary["invalid_rows_removed"] == 1


def test_prepare_rejects_conflicting_labels_for_identical_text(tmp_path):
    path = tmp_path / "conflict.csv"
    pd.DataFrame(
        [
            {
                "subject": "Same",
                "body": "Text",
                "type": "Incident",
                "queue": "A",
                "priority": "high",
                "language": "en",
            },
            {
                "subject": "Same",
                "body": "Text",
                "type": "Incident",
                "queue": "B",
                "priority": "high",
                "language": "en",
            },
        ]
    ).to_csv(path, index=False)

    with pytest.raises(DataValidationError, match="conflicting"):
        load_and_prepare(_config(path, tmp_path))
