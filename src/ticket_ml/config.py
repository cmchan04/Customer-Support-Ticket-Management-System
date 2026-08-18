"""Training configuration and TOML loading."""

from __future__ import annotations

import tomllib
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass(frozen=True)
class TrainingConfig:
    """All settings that affect a reproducible training run."""

    dataset_path: Path
    artifact_dir: Path
    report_dir: Path
    cache_dir: Path
    random_seed: int = 42
    test_size: float = 0.20
    cv_folds: int = 5
    n_jobs: int = 4
    minimum_accuracy: float = 0.90
    ngram_ranges: tuple[tuple[int, int], ...] = ((1, 1), (1, 2))
    min_dfs: tuple[int, ...] = (2, 5)
    max_dfs: tuple[float, ...] = (0.95,)
    logistic_c: tuple[float, ...] = (0.5, 1.0)
    svm_c: tuple[float, ...] = (0.5, 1.0)
    nb_alpha: tuple[float, ...] = (0.1, 1.0)
    decision_tree_max_depth: tuple[int, ...] = (10, 20)
    decision_tree_min_samples_leaf: tuple[int, ...] = (1, 3)
    xgboost_max_depth: tuple[int, ...] = (6, 10)
    xgboost_n_estimators: tuple[int, ...] = (200, 400)
    weighted_svm_subject_weights: tuple[int, ...] = (1, 2, 3, 4)
    weighted_svm_c: float = 10.0
    weighted_svm_character_weight: float = 0.5
    weighted_svm_character_ngram_range: tuple[int, int] = (3, 5)
    weighted_svm_character_min_df: int = 2
    weighted_svm_character_max_features: int = 50_000

    @classmethod
    def from_toml(cls, config_path: str | Path) -> TrainingConfig:
        """Load configuration paths relative to the repository root."""
        path = Path(config_path).resolve()
        with path.open("rb") as config_file:
            raw = tomllib.load(config_file)

        training = raw["training"]
        search = raw["search"]
        project_root = path.parent.parent

        def resolve(value: str) -> Path:
            candidate = Path(value)
            return candidate if candidate.is_absolute() else (project_root / candidate).resolve()

        return cls(
            dataset_path=resolve(training["dataset_path"]),
            artifact_dir=resolve(training["artifact_dir"]),
            report_dir=resolve(training["report_dir"]),
            cache_dir=resolve(training["cache_dir"]),
            random_seed=int(training["random_seed"]),
            test_size=float(training["test_size"]),
            cv_folds=int(training["cv_folds"]),
            n_jobs=int(training["n_jobs"]),
            minimum_accuracy=float(training.get("minimum_accuracy", 0.90)),
            ngram_ranges=tuple(
                tuple(int(value) for value in pair) for pair in search["ngram_ranges"]
            ),
            min_dfs=tuple(int(value) for value in search["min_dfs"]),
            max_dfs=tuple(float(value) for value in search["max_dfs"]),
            logistic_c=tuple(float(value) for value in search["logistic_c"]),
            svm_c=tuple(float(value) for value in search["svm_c"]),
            nb_alpha=tuple(float(value) for value in search["nb_alpha"]),
            decision_tree_max_depth=tuple(
                int(value) for value in search["decision_tree_max_depth"]
            ),
            decision_tree_min_samples_leaf=tuple(
                int(value) for value in search["decision_tree_min_samples_leaf"]
            ),
            xgboost_max_depth=tuple(int(value) for value in search["xgboost_max_depth"]),
            xgboost_n_estimators=tuple(
                int(value) for value in search["xgboost_n_estimators"]
            ),
            weighted_svm_subject_weights=tuple(
                int(value) for value in search["weighted_svm_subject_weights"]
            ),
            weighted_svm_c=float(search["weighted_svm_c"]),
            weighted_svm_character_weight=float(search["weighted_svm_character_weight"]),
            weighted_svm_character_ngram_range=tuple(
                int(value) for value in search["weighted_svm_character_ngram_range"]
            ),
            weighted_svm_character_min_df=int(search["weighted_svm_character_min_df"]),
            weighted_svm_character_max_features=int(
                search["weighted_svm_character_max_features"]
            ),
        )

    def as_metadata(self) -> dict[str, object]:
        """Return a JSON-safe representation for the model metadata file."""
        values = asdict(self)
        for name in ("dataset_path", "artifact_dir", "report_dir", "cache_dir"):
            values[name] = str(values[name])
        return values
