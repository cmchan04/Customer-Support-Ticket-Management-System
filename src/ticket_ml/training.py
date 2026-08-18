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
import numpy as np
from sklearn.base import BaseEstimator, ClassifierMixin, clone
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GridSearchCV, StratifiedKFold
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import FeatureUnion, Pipeline
from sklearn.preprocessing import LabelEncoder
from sklearn.svm import LinearSVC
from sklearn.tree import DecisionTreeClassifier
from sklearn.utils.class_weight import compute_sample_weight
from xgboost import XGBClassifier

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


@dataclass(frozen=True)
class WeightedSvmTargetResult:
    """Selected subject weighting and its independent holdout performance."""

    target: str
    selected_subject_weight: int
    character_feature_weight: float
    selected_cv_macro_f1: float
    selected_cv_accuracy: float
    baseline_holdout_metrics: dict[str, float]
    weighted_holdout_metrics: dict[str, float]
    misclassified_count: int
    candidate_results: tuple[dict[str, float | int], ...]


@dataclass(frozen=True)
class WeightedSvmExperimentSummary:
    """Results of the subject-weighted word/character Linear SVM experiment."""

    artifact_dir: Path
    report_dir: Path
    queue: WeightedSvmTargetResult
    priority: WeightedSvmTargetResult

    def as_dict(self) -> dict[str, Any]:
        return {
            "artifact_dir": str(self.artifact_dir),
            "report_dir": str(self.report_dir),
            "queue": _weighted_svm_result_as_dict(self.queue),
            "priority": _weighted_svm_result_as_dict(self.priority),
        }


class LabelEncodedXGBClassifier(ClassifierMixin, BaseEstimator):
    """Adapt XGBoost to the project's human-readable string labels.

    XGBoost requires zero-based integer targets, while the public prediction
    interface must continue returning queue and priority names. This wrapper
    label-encodes targets for fitting and decodes predictions for evaluation
    and use by ``TicketPredictor``.
    """

    def __init__(
        self,
        *,
        max_depth: int = 6,
        n_estimators: int = 200,
        learning_rate: float = 0.1,
        random_state: int | None = None,
    ) -> None:
        self.max_depth = max_depth
        self.n_estimators = n_estimators
        self.learning_rate = learning_rate
        self.random_state = random_state

    def fit(self, x: Any, y: Any, sample_weight: Any = None) -> LabelEncodedXGBClassifier:
        labels = np.asarray(y)
        self.label_encoder_ = LabelEncoder().fit(labels)
        encoded_labels = self.label_encoder_.transform(labels)
        self.classes_ = self.label_encoder_.classes_
        weights = compute_sample_weight(class_weight="balanced", y=labels)
        if sample_weight is not None:
            weights = weights * np.asarray(sample_weight)

        self.model_ = XGBClassifier(
            objective="multi:softprob",
            eval_metric="mlogloss",
            max_depth=self.max_depth,
            n_estimators=self.n_estimators,
            learning_rate=self.learning_rate,
            random_state=self.random_state,
            num_class=len(self.classes_),
            n_jobs=1,
            tree_method="hist",
            device="cpu",
            verbosity=0,
        )
        self.model_.fit(x, encoded_labels, sample_weight=weights)
        return self

    def predict(self, x: Any) -> np.ndarray:
        raw_predictions = np.asarray(self.model_.predict(x))
        encoded_predictions = (
            raw_predictions.argmax(axis=1)
            if raw_predictions.ndim == 2
            else raw_predictions.astype(int)
        )
        return self.label_encoder_.inverse_transform(encoded_predictions)

    def predict_proba(self, x: Any) -> np.ndarray:
        return self.model_.predict_proba(x)


def _target_result_as_dict(result: TargetTrainingResult) -> dict[str, Any]:
    return {
        "selected_model": result.selected_model,
        "cv_macro_f1": result.cv_macro_f1,
        "best_params": result.best_params,
        "holdout_metrics": result.holdout_metrics,
        "misclassified_count": result.misclassified_count,
        "candidate_results": list(result.candidate_results),
    }


def _weighted_svm_result_as_dict(result: WeightedSvmTargetResult) -> dict[str, Any]:
    return {
        "selected_subject_weight": result.selected_subject_weight,
        "body_weight": 1,
        "character_feature_weight": result.character_feature_weight,
        "selected_cv_macro_f1": result.selected_cv_macro_f1,
        "selected_cv_accuracy": result.selected_cv_accuracy,
        "baseline_holdout_metrics": result.baseline_holdout_metrics,
        "weighted_holdout_metrics": result.weighted_holdout_metrics,
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
        (
            "decision_tree",
            _pipeline(
                DecisionTreeClassifier(
                    class_weight="balanced", random_state=config.random_seed
                ),
                target_cache / "decision_tree",
            ),
            feature_grid
            | {
                "classifier__max_depth": list(config.decision_tree_max_depth),
                "classifier__min_samples_leaf": list(config.decision_tree_min_samples_leaf),
            },
        ),
        (
            "xgboost",
            _pipeline(
                LabelEncodedXGBClassifier(random_state=config.random_seed),
                target_cache / "xgboost",
            ),
            feature_grid
            | {
                "classifier__max_depth": list(config.xgboost_max_depth),
                "classifier__n_estimators": list(config.xgboost_n_estimators),
            },
        ),
    ]


def _weighted_word_character_svm_pipeline(config: TrainingConfig, cache_dir: Path) -> Pipeline:
    """Build a Linear SVM with complementary word and character TF-IDF features."""
    word_features = Pipeline(
        [
            ("text", TicketTextPreprocessor()),
            (
                "tfidf",
                TfidfVectorizer(
                    strip_accents="unicode",
                    sublinear_tf=True,
                    max_features=150_000,
                    ngram_range=(1, 3),
                    min_df=1,
                    max_df=1.0,
                ),
            ),
        ]
    )
    character_features = Pipeline(
        [
            ("text", TicketTextPreprocessor()),
            (
                "tfidf",
                TfidfVectorizer(
                    analyzer="char_wb",
                    strip_accents="unicode",
                    sublinear_tf=True,
                    max_features=config.weighted_svm_character_max_features,
                    ngram_range=config.weighted_svm_character_ngram_range,
                    min_df=config.weighted_svm_character_min_df,
                ),
            ),
        ]
    )
    return Pipeline(
        [
            (
                "features",
                FeatureUnion(
                    [("word", word_features), ("character", character_features)],
                    transformer_weights={
                        "word": 1.0,
                        "character": config.weighted_svm_character_weight,
                    },
                ),
            ),
            (
                "classifier",
                LinearSVC(
                    C=config.weighted_svm_c,
                    class_weight="balanced",
                    random_state=config.random_seed,
                ),
            ),
        ],
        memory=joblib.Memory(cache_dir, verbose=0),
    )


def _weighted_svm_parameter_grid(config: TrainingConfig) -> list[dict[str, list[int]]]:
    """Keep both TF-IDF branches at the same subject-to-body ratio."""
    return [
        {
            "features__word__text__subject_weight": [subject_weight],
            "features__character__text__subject_weight": [subject_weight],
        }
        for subject_weight in config.weighted_svm_subject_weights
    ]


def _train_weighted_svm_target(
    target: str,
    target_train: Any,
    target_test: Any,
    dataset: PreparedDataset,
    split: DataSplit,
    config: TrainingConfig,
    artifact_dir: Path,
    report_dir: Path,
) -> WeightedSvmTargetResult:
    cross_validation = StratifiedKFold(
        n_splits=config.cv_folds, shuffle=True, random_state=config.random_seed
    )
    baseline = _pipeline(
        LinearSVC(
            C=config.weighted_svm_c,
            class_weight="balanced",
            random_state=config.random_seed,
        ),
        config.cache_dir / "weighting_experiment" / target / "baseline",
    )
    baseline.set_params(
        tfidf__ngram_range=(1, 3),
        tfidf__min_df=1,
        tfidf__max_df=1.0,
    )
    baseline.fit(split.x_train, target_train)
    baseline_metrics = score_predictions(target_test, baseline.predict(split.x_test))

    search = GridSearchCV(
        estimator=_weighted_word_character_svm_pipeline(
            config, config.cache_dir / "weighting_experiment" / target / "weighted"
        ),
        param_grid=_weighted_svm_parameter_grid(config),
        scoring={"macro_f1": "f1_macro", "accuracy": "accuracy"},
        cv=cross_validation,
        n_jobs=config.n_jobs,
        refit="macro_f1",
        return_train_score=False,
    )
    search.fit(split.x_train, target_train)

    candidate_results: list[dict[str, float | int]] = []
    for index, subject_weight in enumerate(config.weighted_svm_subject_weights):
        candidate_results.append(
            {
                "subject_weight": subject_weight,
                "body_weight": 1,
                "character_feature_weight": config.weighted_svm_character_weight,
                "cv_macro_f1": float(search.cv_results_["mean_test_macro_f1"][index]),
                "cv_accuracy": float(search.cv_results_["mean_test_accuracy"][index]),
            }
        )

    evaluation = evaluate_pipeline(
        search.best_estimator_, split.x_test, target_test, target, report_dir
    )
    final_pipeline = clone(search.best_estimator_)
    final_target = dataset.queue if target == "queue" else dataset.priority
    final_pipeline.fit(dataset.features, final_target)
    joblib.dump(
        final_pipeline,
        artifact_dir / f"{target}_weighted_word_character_svm_pipeline.joblib",
        compress=3,
    )
    best_index = search.best_index_
    best_weight = config.weighted_svm_subject_weights[best_index]
    return WeightedSvmTargetResult(
        target=target,
        selected_subject_weight=best_weight,
        character_feature_weight=config.weighted_svm_character_weight,
        selected_cv_macro_f1=float(search.best_score_),
        selected_cv_accuracy=float(search.cv_results_["mean_test_accuracy"][best_index]),
        baseline_holdout_metrics=baseline_metrics,
        weighted_holdout_metrics=evaluation.metrics,
        misclassified_count=evaluation.misclassified_count,
        candidate_results=tuple(candidate_results),
    )


def tune_weighted_svm(config: TrainingConfig) -> WeightedSvmExperimentSummary:
    """Tune subject emphasis without modifying the standard saved production models."""
    ensure_nltk_resources()
    experiment_artifact_dir = config.artifact_dir / "experiments" / "weighted_svm"
    experiment_report_dir = config.report_dir / "weighting_experiment"
    experiment_artifact_dir.mkdir(parents=True, exist_ok=True)
    experiment_report_dir.mkdir(parents=True, exist_ok=True)

    dataset = load_and_prepare(config)
    split = make_train_test_split(dataset, config)
    queue = _train_weighted_svm_target(
        "queue",
        split.queue_train,
        split.queue_test,
        dataset,
        split,
        config,
        experiment_artifact_dir,
        experiment_report_dir,
    )
    priority = _train_weighted_svm_target(
        "priority",
        split.priority_train,
        split.priority_test,
        dataset,
        split,
        config,
        experiment_artifact_dir,
        experiment_report_dir,
    )
    summary = WeightedSvmExperimentSummary(
        artifact_dir=experiment_artifact_dir,
        report_dir=experiment_report_dir,
        queue=queue,
        priority=priority,
    )
    _write_json(experiment_report_dir / "metrics.json", summary.as_dict())
    return summary


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
        "xgboost",
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
