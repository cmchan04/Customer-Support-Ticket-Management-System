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
        )

    def as_metadata(self) -> dict[str, object]:
        """Return a JSON-safe representation for the model metadata file."""
        values = asdict(self)
        for name in ("dataset_path", "artifact_dir", "report_dir", "cache_dir"):
            values[name] = str(values[name])
        return values
