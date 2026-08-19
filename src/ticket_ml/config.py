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
    type_svm_weights: tuple[int, ...] = (1, 2, 3)
    type_svm_c: tuple[float, ...] = (1.0, 3.0, 10.0)
    type_svm_ngram_ranges: tuple[tuple[int, int], ...] = ((1, 3),)
    type_onehot_weights: tuple[float, ...] = (0.25, 0.5, 1.0, 2.0)
    type_router_weights: tuple[int, ...] = (1, 3)
    type_router_c: tuple[float, ...] = (10.0, 30.0)
    type_router_ngram_ranges: tuple[tuple[int, int], ...] = ((1, 3),)
    type_router_max_features: int = 300_000
    type_router_class_weight_powers: tuple[float, ...] = (0.5, 1.0)
    type_router_calibrate_queue: bool = True
    type_router_calibration_cv_folds: int = 3
    type_router_calibration_passes: int = 3
    type_router_calibration_grid: tuple[float, ...] = (
        -1.5,
        -1.0,
        -0.75,
        -0.5,
        -0.25,
        0.0,
        0.25,
        0.5,
        0.75,
        1.0,
        1.5,
    )
    # The joint experiment predicts queue||priority as one label while still
    # routing to a classifier trained for the customer-selected ticket type.
    # The defaults are intentionally small: this is an optional, CPU-bound
    # experiment rather than part of every ordinary ``ticket-ml train`` run.
    joint_type_weights: tuple[int, ...] = (3,)
    joint_c: tuple[float, ...] = (10.0,)
    joint_ngram_ranges: tuple[tuple[int, int], ...] = ((1, 3), (1, 4))
    joint_max_features: int = 300_000
    joint_class_weight_powers: tuple[float, ...] = (1.0, 1.25)
    joint_score_temperatures: tuple[float, ...] = (0.1, 0.25)

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
            type_svm_weights=tuple(int(value) for value in search["type_svm_weights"]),
            type_svm_c=tuple(float(value) for value in search["type_svm_c"]),
            type_svm_ngram_ranges=tuple(
                tuple(int(value) for value in pair)
                for pair in search["type_svm_ngram_ranges"]
            ),
            type_onehot_weights=tuple(
                float(value) for value in search["type_onehot_weights"]
            ),
            type_router_weights=tuple(
                int(value) for value in search.get("type_router_weights", (1, 3))
            ),
            type_router_c=tuple(
                float(value) for value in search.get("type_router_c", (10.0, 30.0))
            ),
            type_router_ngram_ranges=tuple(
                tuple(int(value) for value in pair)
                for pair in search.get("type_router_ngram_ranges", ((1, 3),))
            ),
            type_router_max_features=int(search.get("type_router_max_features", 300_000)),
            type_router_class_weight_powers=tuple(
                float(value)
                for value in search.get("type_router_class_weight_powers", (0.5, 1.0))
            ),
            type_router_calibrate_queue=bool(
                search.get("type_router_calibrate_queue", True)
            ),
            type_router_calibration_cv_folds=int(
                search.get("type_router_calibration_cv_folds", 3)
            ),
            type_router_calibration_passes=int(
                search.get("type_router_calibration_passes", 3)
            ),
            type_router_calibration_grid=tuple(
                float(value)
                for value in search.get(
                    "type_router_calibration_grid",
                    (-1.5, -1.0, -0.75, -0.5, -0.25, 0.0, 0.25, 0.5, 0.75, 1.0, 1.5),
                )
            ),
            joint_type_weights=tuple(
                int(value) for value in search.get("joint_type_weights", (3,))
            ),
            joint_c=tuple(float(value) for value in search.get("joint_c", (10.0,))),
            joint_ngram_ranges=tuple(
                tuple(int(value) for value in pair)
                for pair in search.get("joint_ngram_ranges", ((1, 3), (1, 4)))
            ),
            joint_max_features=int(search.get("joint_max_features", 300_000)),
            joint_class_weight_powers=tuple(
                float(value)
                for value in search.get("joint_class_weight_powers", (1.0, 1.25))
            ),
            joint_score_temperatures=tuple(
                float(value)
                for value in search.get("joint_score_temperatures", (0.1, 0.25))
            ),
        )

    def as_metadata(self) -> dict[str, object]:
        """Return a JSON-safe representation for the model metadata file."""
        values = asdict(self)
        for name in ("dataset_path", "artifact_dir", "report_dir", "cache_dir"):
            values[name] = str(values[name])
        return values
