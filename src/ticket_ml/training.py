"""Model selection, final fitting, evaluation, and artifact persistence."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from platform import python_version
from typing import Any

import joblib
from sklearn.base import clone
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GridSearchCV, StratifiedKFold
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC

from ticket_ml.config import TrainingConfig
from ticket_ml.data import DataSplit, PreparedDataset, load_and_prepare, make_train_test_split
from ticket_ml.evaluation import EvaluationResult, evaluate_pipeline, score_predictions
from ticket_ml.text import TicketTextPreprocessor, ensure_nltk_resources


@dataclass(frozen=True)
class TargetTrainingResult:
    target: str
    selected_model: str
    cv_macro_f1: float
    best_params: dict[str, Any]
    holdout_metrics: dict[str, float]
    misclassified_count: int
    candidate_results: tuple[dict[str, Any], ...]


@dataclass(frozen=True)
class TrainingRunSummary:
    artifact_dir: Path
    report_dir: Path
    dataset_summary: dict[str, int]
    queue: TargetTrainingResult
    priority: TargetTrainingResult
    quality_gate: dict[str, Any]

    def as_dict(self) -> dict[str, Any]:
        return {
            "artifact_dir": str(self.artifact_dir),
            "report_dir": str(self.report_dir),
            "dataset_summary": self.dataset_summary,
            "queue": _target_result_as_dict(self.queue),
            "priority": _target_result_as_dict(self.priority),
            "quality_gate": self.quality_gate,
        }


def _target_result_as_dict(result: TargetTrainingResult) -> dict[str, Any]:
    return {
        "selected_model": result.selected_model,
        "cv_macro_f1": result.cv_macro_f1,
        "best_params": result.best_params,
        "holdout_metrics": result.holdout_metrics,
        "misclassified_count": result.misclassified_count,
        "candidate_results": list(result.candidate_results),
    }


def _json_safe(value: Any) -> Any:
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if hasattr(value, "item"):
        return value.item()
    return value


def _write_json(path: Path, content: dict[str, Any]) -> None:
    path.write_text(json.dumps(_json_safe(content), indent=2, sort_keys=True), encoding="utf-8")


def _pipeline(classifier: Any, cache_dir: Path) -> Pipeline:
    return Pipeline(
        [
            ("text", TicketTextPreprocessor()),
            (
                "tfidf",
                TfidfVectorizer(strip_accents="unicode", sublinear_tf=True, max_features=150_000),
            ),
            ("classifier", classifier),
        ],
        memory=joblib.Memory(cache_dir, verbose=0),
    )


def _candidate_specs(
    config: TrainingConfig, target: str
) -> list[tuple[str, Pipeline, dict[str, list[Any]]]]:
    feature_grid: dict[str, list[Any]] = {
        "tfidf__ngram_range": list(config.ngram_ranges),
        "tfidf__min_df": list(config.min_dfs),
        "tfidf__max_df": list(config.max_dfs),
    }
    target_cache = config.cache_dir / target
    return [
        (
            "logistic_regression",
            _pipeline(
                LogisticRegression(
                    class_weight="balanced", max_iter=2_000, random_state=config.random_seed
                ),
                target_cache / "logistic_regression",
            ),
            feature_grid | {"classifier__C": list(config.logistic_c)},
        ),
        (
            "multinomial_naive_bayes",
            _pipeline(MultinomialNB(), target_cache / "multinomial_naive_bayes"),
            feature_grid | {"classifier__alpha": list(config.nb_alpha)},
        ),
        (
            "linear_svm",
            _pipeline(
                LinearSVC(class_weight="balanced", random_state=config.random_seed),
                target_cache / "linear_svm",
            ),
            feature_grid | {"classifier__C": list(config.svm_c)},
        ),
    ]


def _versions() -> dict[str, str]:
    packages = (
        "joblib",
        "matplotlib",
        "nltk",
        "numpy",
        "pandas",
        "pytest",
        "ruff",
        "scikit-learn",
        "scipy",
        "seaborn",
    )
    output: dict[str, str] = {"python": python_version()}
    for package in packages:
        try:
            output[package] = version(package)
        except PackageNotFoundError:
            output[package] = "not-installed"
    return output


def _train_target(
    target: str,
    target_train: Any,
    target_test: Any,
    dataset: PreparedDataset,
    split: DataSplit,
    config: TrainingConfig,
) -> TargetTrainingResult:
    cross_validation = StratifiedKFold(
        n_splits=config.cv_folds, shuffle=True, random_state=config.random_seed
    )
    searches: list[tuple[str, GridSearchCV]] = []
    candidate_results: list[dict[str, Any]] = []
    for candidate_name, pipeline, parameter_grid in _candidate_specs(config, target):
        search = GridSearchCV(
            estimator=pipeline,
            param_grid=parameter_grid,
            scoring={"macro_f1": "f1_macro", "accuracy": "accuracy"},
            cv=cross_validation,
            n_jobs=config.n_jobs,
            refit="macro_f1",
            return_train_score=False,
        )
        search.fit(split.x_train, target_train)
        searches.append((candidate_name, search))
        candidate_predictions = search.best_estimator_.predict(split.x_test)
        candidate_holdout_metrics = score_predictions(target_test, candidate_predictions)
        candidate_results.append(
            {
                "model": candidate_name,
                "cv_macro_f1": float(search.best_score_),
                "cv_accuracy": float(search.cv_results_["mean_test_accuracy"][search.best_index_]),
                "best_params": _json_safe(search.best_params_),
                "holdout_accuracy": candidate_holdout_metrics["accuracy"],
                "holdout_macro_f1": candidate_holdout_metrics["macro_f1"],
            }
        )

    selected_name, selected_search = max(searches, key=lambda entry: entry[1].best_score_)
    evaluation: EvaluationResult = evaluate_pipeline(
        selected_search.best_estimator_, split.x_test, target_test, target, config.report_dir
    )
    final_pipeline = clone(selected_search.best_estimator_)
    final_target = dataset.queue if target == "queue" else dataset.priority
    final_pipeline.fit(dataset.features, final_target)
    joblib.dump(final_pipeline, config.artifact_dir / f"{target}_pipeline.joblib", compress=3)
    return TargetTrainingResult(
        target=target,
        selected_model=selected_name,
        cv_macro_f1=float(selected_search.best_score_),
        best_params=_json_safe(selected_search.best_params_),
        holdout_metrics=evaluation.metrics,
        misclassified_count=evaluation.misclassified_count,
        candidate_results=tuple(candidate_results),
    )


def train_all(config: TrainingConfig) -> TrainingRunSummary:
    """Train, evaluate, and persist the queue and priority models in one run."""
    ensure_nltk_resources()
    config.artifact_dir.mkdir(parents=True, exist_ok=True)
    config.report_dir.mkdir(parents=True, exist_ok=True)
    config.cache_dir.mkdir(parents=True, exist_ok=True)

    dataset = load_and_prepare(config)
    split = make_train_test_split(dataset, config)
    queue_result = _train_target(
        "queue", split.queue_train, split.queue_test, dataset, split, config
    )
    priority_result = _train_target(
        "priority", split.priority_train, split.priority_test, dataset, split, config
    )
    quality_gate = {
        "minimum_accuracy": config.minimum_accuracy,
        "passed": bool(
            queue_result.holdout_metrics["accuracy"] >= config.minimum_accuracy
            and priority_result.holdout_metrics["accuracy"] >= config.minimum_accuracy
        ),
        "targets": {
            "queue": {
                "accuracy": queue_result.holdout_metrics["accuracy"],
                "passed": queue_result.holdout_metrics["accuracy"] >= config.minimum_accuracy,
            },
            "priority": {
                "accuracy": priority_result.holdout_metrics["accuracy"],
                "passed": priority_result.holdout_metrics["accuracy"] >= config.minimum_accuracy,
            },
        },
    }
    summary = TrainingRunSummary(
        artifact_dir=config.artifact_dir,
        report_dir=config.report_dir,
        dataset_summary=dataset.summary,
        queue=queue_result,
        priority=priority_result,
        quality_gate=quality_gate,
    )

    metadata = {
        "trained_at_utc": datetime.now(UTC).isoformat(),
        "dataset": {
            "path": str(config.dataset_path),
            "sha256": dataset.source_sha256,
            **dataset.summary,
        },
        "labels": {
            "queue": sorted(str(label) for label in dataset.queue.unique()),
            "priority": sorted(str(label) for label in dataset.priority.unique()),
        },
        "split": {
            "random_seed": config.random_seed,
            "test_size": config.test_size,
            "train_rows": len(split.x_train),
            "test_rows": len(split.x_test),
        },
        "config": config.as_metadata(),
        "library_versions": _versions(),
        "results": summary.as_dict(),
    }
    _write_json(config.artifact_dir / "metadata.json", metadata)
    _write_json(config.report_dir / "metrics.json", summary.as_dict())
    return summary
