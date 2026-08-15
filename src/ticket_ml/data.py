"""Dataset validation, preparation, and reproducible splitting."""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path

import pandas as pd
from sklearn.model_selection import train_test_split

from ticket_ml.config import TrainingConfig

REQUIRED_COLUMNS = ("subject", "body", "queue", "priority", "language")


class DataValidationError(ValueError):
    """Raised when the training CSV cannot safely produce a prediction dataset."""


@dataclass(frozen=True)
class PreparedDataset:
    """Validated English ticket text and the two labels to predict."""

    features: pd.DataFrame
    queue: pd.Series
    priority: pd.Series
    source_sha256: str
    summary: dict[str, int]


@dataclass(frozen=True)
class DataSplit:
    """One shared ticket split for the independent queue and priority tasks."""

    x_train: pd.DataFrame
    x_test: pd.DataFrame
    queue_train: pd.Series
    queue_test: pd.Series
    priority_train: pd.Series
    priority_test: pd.Series


def _file_sha256(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _normalise_text(series: pd.Series) -> pd.Series:
    return series.fillna("").astype(str).str.strip()


def load_and_prepare(config: TrainingConfig) -> PreparedDataset:
    """Load, validate, filter, and deduplicate tickets before every training run."""
    if not config.dataset_path.is_file():
        raise FileNotFoundError(f"Dataset not found: {config.dataset_path}")

    raw = pd.read_csv(config.dataset_path)
    missing_columns = sorted(set(REQUIRED_COLUMNS) - set(raw.columns))
    if missing_columns:
        raise DataValidationError(
            f"Dataset is missing required columns: {', '.join(missing_columns)}"
        )

    english = raw.loc[raw["language"].fillna("").astype(str).str.casefold().eq("en")].copy()
    prepared = pd.DataFrame(
        {
            "subject": _normalise_text(english["subject"]),
            "body": _normalise_text(english["body"]),
            "queue": _normalise_text(english["queue"]),
            "priority": _normalise_text(english["priority"]),
        }
    )
    valid_rows = prepared["body"].ne("") & prepared["queue"].ne("") & prepared["priority"].ne("")
    prepared = prepared.loc[valid_rows].copy()

    label_counts = prepared.groupby(["subject", "body"], dropna=False)[
        ["queue", "priority"]
    ].nunique()
    if bool((label_counts > 1).any().any()):
        raise DataValidationError(
            "Identical subject/body text has conflicting queue or priority labels; "
            "resolve these records before training."
        )

    before_deduplication = len(prepared)
    prepared = prepared.drop_duplicates(subset=["subject", "body"], keep="first").reset_index(
        drop=True
    )
    if prepared.empty:
        raise DataValidationError("No valid English tickets remain after preparation.")

    summary = {
        "source_rows": int(len(raw)),
        "english_rows": int(len(english)),
        "invalid_rows_removed": int(len(english) - int(valid_rows.sum())),
        "duplicates_removed": int(before_deduplication - len(prepared)),
        "prepared_rows": int(len(prepared)),
        "queue_classes": int(prepared["queue"].nunique()),
        "priority_classes": int(prepared["priority"].nunique()),
    }
    return PreparedDataset(
        features=prepared[["subject", "body"]].copy(),
        queue=prepared["queue"].copy(),
        priority=prepared["priority"].copy(),
        source_sha256=_file_sha256(config.dataset_path),
        summary=summary,
    )


def make_train_test_split(dataset: PreparedDataset, config: TrainingConfig) -> DataSplit:
    """Create an 80/20 ticket split stratified over queue/priority combinations."""
    combined_label = dataset.queue + "\x1f" + dataset.priority
    smallest_combination = int(combined_label.value_counts().min())
    if smallest_combination < 2:
        raise DataValidationError(
            "At least two records are required for every queue/priority combination "
            "to create a stratified holdout split."
        )

    indices = list(range(len(dataset.features)))
    train_indices, test_indices = train_test_split(
        indices,
        test_size=config.test_size,
        random_state=config.random_seed,
        stratify=combined_label,
    )
    return DataSplit(
        x_train=dataset.features.iloc[train_indices].reset_index(drop=True),
        x_test=dataset.features.iloc[test_indices].reset_index(drop=True),
        queue_train=dataset.queue.iloc[train_indices].reset_index(drop=True),
        queue_test=dataset.queue.iloc[test_indices].reset_index(drop=True),
        priority_train=dataset.priority.iloc[train_indices].reset_index(drop=True),
        priority_test=dataset.priority.iloc[test_indices].reset_index(drop=True),
    )
