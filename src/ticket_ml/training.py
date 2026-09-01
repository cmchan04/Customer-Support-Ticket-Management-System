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
import pandas as pd
from sklearn.base import BaseEstimator, ClassifierMixin, clone
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score
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
from ticket_ml.evaluation import (
    EvaluationResult,
    evaluate_joint_pipeline,
    evaluate_pipeline,
    score_predictions,
)
from ticket_ml.models import CalibratedSVMClassifier, TicketTypeRouterClassifier
from ticket_ml.text import TicketTextPreprocessor, TicketTypeOneHot, ensure_nltk_resources


@dataclass(frozen=True)
class TargetTrainingResult:
    target: str
    selected_model: str
    cv_macro_f1: float
    best_params: dict[str, Any]
    holdout_metrics: dict[str, float]
    misclassified_count: int
    candidate_results: tuple[dict[str, Any], ...]
    confidence_method: str


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
class TypeSvmTargetResult:
    """Selected type weight and SVM settings for one prediction target."""

    target: str
    selected_type_weight: int
    selected_c: float
    selected_ngram_range: tuple[int, int]
    selected_cv_macro_f1: float
    selected_cv_accuracy: float
    baseline_holdout_metrics: dict[str, float]
    type_holdout_metrics: dict[str, float]
    misclassified_count: int
    candidate_results: tuple[dict[str, Any], ...]


@dataclass(frozen=True)
class TypeSvmExperimentSummary:
    """Results of the customer-selected ticket-type SVM experiment."""

    artifact_dir: Path
    report_dir: Path
    queue: TypeSvmTargetResult
    priority: TypeSvmTargetResult

    def as_dict(self) -> dict[str, Any]:
        return {
            "artifact_dir": str(self.artifact_dir),
            "report_dir": str(self.report_dir),
            "queue": _type_svm_result_as_dict(self.queue),
            "priority": _type_svm_result_as_dict(self.priority),
        }


@dataclass(frozen=True)
class TypeOneHotTargetResult:
    target: str
    selected_type_feature_weight: float
    selected_c: float
    selected_cv_macro_f1: float
    selected_cv_accuracy: float
    baseline_holdout_metrics: dict[str, float]
    onehot_holdout_metrics: dict[str, float]
    misclassified_count: int
    candidate_results: tuple[dict[str, Any], ...]


@dataclass(frozen=True)
class TypeOneHotExperimentSummary:
    artifact_dir: Path
    report_dir: Path
    queue: TypeOneHotTargetResult
    priority: TypeOneHotTargetResult

    def as_dict(self) -> dict[str, Any]:
        return {
            "artifact_dir": str(self.artifact_dir),
            "report_dir": str(self.report_dir),
            "queue": _type_onehot_result_as_dict(self.queue),
            "priority": _type_onehot_result_as_dict(self.priority),
        }


@dataclass(frozen=True)
class TypeRouterTargetResult:
    """Holdout result for the per-ticket-type routed classifier."""

    target: str
    selected_type_weight: int
    selected_c: float
    selected_ngram_range: tuple[int, int]
    selected_class_weight_power: float
    calibration_enabled: bool
    calibration_bias: tuple[float, ...] | None
    selected_cv_macro_f1: float
    selected_cv_accuracy: float
    holdout_metrics: dict[str, float]
    misclassified_count: int
    candidate_results: tuple[dict[str, Any], ...]


@dataclass(frozen=True)
class TypeRouterExperimentSummary:
    """Independent results and artifacts for routed type-specific models."""

    artifact_dir: Path
    report_dir: Path
    queue: TypeRouterTargetResult
    priority: TypeRouterTargetResult

    def as_dict(self) -> dict[str, Any]:
        return {
            "artifact_dir": str(self.artifact_dir),
            "report_dir": str(self.report_dir),
            "queue": _type_router_result_as_dict(self.queue),
            "priority": _type_router_result_as_dict(self.priority),
        }


@dataclass(frozen=True)
class JointTypeExperimentSummary:
    """Results for the optional joint queue/priority type-router experiment."""

    artifact_dir: Path
    report_dir: Path
    selected_params: dict[str, Any]
    selected_cv_macro_f1: float
    selected_cv_accuracy: float
    holdout_queue_metrics: dict[str, float]
    holdout_priority_metrics: dict[str, float]
    queue_misclassified_count: int
    priority_misclassified_count: int
    joint_accuracy: float
    candidate_results: tuple[dict[str, Any], ...]
    confidence_method: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "artifact_dir": str(self.artifact_dir),
            "report_dir": str(self.report_dir),
            "selected_model": "linear_svm_joint_by_type",
            "selected_params": self.selected_params,
            "selected_cv_macro_f1": self.selected_cv_macro_f1,
            "selected_cv_accuracy": self.selected_cv_accuracy,
            "holdout_queue_metrics": self.holdout_queue_metrics,
            "holdout_priority_metrics": self.holdout_priority_metrics,
            "queue_misclassified_count": self.queue_misclassified_count,
            "priority_misclassified_count": self.priority_misclassified_count,
            "joint_accuracy": self.joint_accuracy,
            "candidate_results": list(self.candidate_results),
            "confidence_method": self.confidence_method,
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
        "confidence_method": result.confidence_method,
    }


def _type_svm_result_as_dict(result: TypeSvmTargetResult) -> dict[str, Any]:
    return {
        "selected_type_weight": result.selected_type_weight,
        "selected_c": result.selected_c,
        "selected_ngram_range": result.selected_ngram_range,
        "selected_cv_macro_f1": result.selected_cv_macro_f1,
        "selected_cv_accuracy": result.selected_cv_accuracy,
        "baseline_holdout_metrics": result.baseline_holdout_metrics,
        "type_holdout_metrics": result.type_holdout_metrics,
        "misclassified_count": result.misclassified_count,
        "candidate_results": list(result.candidate_results),
    }


def _type_onehot_result_as_dict(result: TypeOneHotTargetResult) -> dict[str, Any]:
    return {
        "selected_type_feature_weight": result.selected_type_feature_weight,
        "selected_c": result.selected_c,
        "selected_cv_macro_f1": result.selected_cv_macro_f1,
        "selected_cv_accuracy": result.selected_cv_accuracy,
        "baseline_holdout_metrics": result.baseline_holdout_metrics,
        "onehot_holdout_metrics": result.onehot_holdout_metrics,
        "misclassified_count": result.misclassified_count,
        "candidate_results": list(result.candidate_results),
    }


def _type_router_result_as_dict(result: TypeRouterTargetResult) -> dict[str, Any]:
    return {
        "selected_type_weight": result.selected_type_weight,
        "selected_c": result.selected_c,
        "selected_ngram_range": result.selected_ngram_range,
        "selected_class_weight_power": result.selected_class_weight_power,
        "calibration_enabled": result.calibration_enabled,
        "calibration_bias": result.calibration_bias,
        "selected_cv_macro_f1": result.selected_cv_macro_f1,
        "selected_cv_accuracy": result.selected_cv_accuracy,
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


def _pipeline(
    classifier: Any,
    cache_dir: Path,
    *,
    subject_weight: int = 1,
    type_weight: int = 0,
    max_features: int = 150_000,
) -> Pipeline:
    """ Preprocess tickets and convert to TF-IDF features before fitting the classifier. """
    
    return Pipeline(
        [
            (
                "text",
                TicketTextPreprocessor(
                    subject_weight=subject_weight,
                    type_weight=type_weight,
                ),
            ),
            (
                "tfidf",
                TfidfVectorizer(
                    strip_accents="unicode", sublinear_tf=True, max_features=max_features
                ),
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
            "linear_svm_with_type",
            _pipeline(
                LinearSVC(class_weight="balanced", random_state=config.random_seed),
                target_cache / "linear_svm_with_type",
            ),
            feature_grid
            | {
                "text__type_weight": list(config.type_svm_weights),
                "classifier__C": list(config.svm_c),
            },
        ),
        (
            "linear_svm_by_type",
            _type_router_pipeline(config, target_cache / "linear_svm_by_type"),
            {
                "base_estimator__text__type_weight": list(config.type_router_weights),
                "base_estimator__tfidf__ngram_range": list(config.type_router_ngram_ranges),
                "base_estimator__tfidf__min_df": [1],
                "base_estimator__tfidf__max_df": [1.0],
                "base_estimator__classifier__C": list(config.type_router_c),
                "class_weight_power": list(config.type_router_class_weight_powers),
            },
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


def _train_type_svm_target(
    target: str,
    target_train: Any,
    target_test: Any,
    dataset: PreparedDataset,
    split: DataSplit,
    config: TrainingConfig,
    artifact_dir: Path,
    report_dir: Path,
) -> TypeSvmTargetResult:
    cross_validation = StratifiedKFold(
        n_splits=config.cv_folds, shuffle=True, random_state=config.random_seed
    )
    baseline = _pipeline(
        LinearSVC(C=10.0, class_weight="balanced", random_state=config.random_seed),
        config.cache_dir / "type_experiment" / target / "baseline",
    )
    baseline.set_params(
        tfidf__ngram_range=(1, 3),
        tfidf__min_df=1,
        tfidf__max_df=1.0,
    )
    baseline.fit(split.x_train, target_train)
    baseline_metrics = score_predictions(target_test, baseline.predict(split.x_test))

    search = GridSearchCV(
        estimator=_pipeline(
            LinearSVC(class_weight="balanced", random_state=config.random_seed),
            config.cache_dir / "type_experiment" / target / "type_svm",
        ),
        param_grid={
            "text__type_weight": list(config.type_svm_weights),
            "tfidf__ngram_range": list(config.type_svm_ngram_ranges),
            "tfidf__min_df": [1],
            "tfidf__max_df": [1.0],
            "classifier__C": list(config.type_svm_c),
        },
        scoring={"macro_f1": "f1_macro", "accuracy": "accuracy"},
        cv=cross_validation,
        n_jobs=config.n_jobs,
        refit="macro_f1",
        return_train_score=False,
    )
    search.fit(split.x_train, target_train)

    candidate_results: list[dict[str, Any]] = []
    for index, params in enumerate(search.cv_results_["params"]):
        candidate_results.append(
            {
                "type_weight": int(params["text__type_weight"]),
                "c": float(params["classifier__C"]),
                "ngram_range": params["tfidf__ngram_range"],
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
        artifact_dir / f"{target}_pipeline.joblib",
        compress=3,
    )
    best_params = search.best_params_
    return TypeSvmTargetResult(
        target=target,
        selected_type_weight=int(best_params["text__type_weight"]),
        selected_c=float(best_params["classifier__C"]),
        selected_ngram_range=tuple(best_params["tfidf__ngram_range"]),
        selected_cv_macro_f1=float(search.best_score_),
        selected_cv_accuracy=float(search.cv_results_["mean_test_accuracy"][search.best_index_]),
        baseline_holdout_metrics=baseline_metrics,
        type_holdout_metrics=evaluation.metrics,
        misclassified_count=evaluation.misclassified_count,
        candidate_results=tuple(candidate_results),
    )


def tune_type_svm(config: TrainingConfig) -> TypeSvmExperimentSummary:
    """Tune customer-selected ticket type without replacing standard artifacts."""
    ensure_nltk_resources()
    experiment_artifact_dir = config.artifact_dir / "experiments" / "type_svm"
    experiment_report_dir = config.report_dir / "type_experiment"
    experiment_artifact_dir.mkdir(parents=True, exist_ok=True)
    experiment_report_dir.mkdir(parents=True, exist_ok=True)

    dataset = load_and_prepare(config)
    split = make_train_test_split(dataset, config)
    queue = _train_type_svm_target(
        "queue",
        split.queue_train,
        split.queue_test,
        dataset,
        split,
        config,
        experiment_artifact_dir,
        experiment_report_dir,
    )
    priority = _train_type_svm_target(
        "priority",
        split.priority_train,
        split.priority_test,
        dataset,
        split,
        config,
        experiment_artifact_dir,
        experiment_report_dir,
    )
    summary = TypeSvmExperimentSummary(
        artifact_dir=experiment_artifact_dir,
        report_dir=experiment_report_dir,
        queue=queue,
        priority=priority,
    )
    _write_json(experiment_report_dir / "metrics.json", summary.as_dict())
    return summary


def _type_router_pipeline(config: TrainingConfig, cache_dir: Path) -> TicketTypeRouterClassifier:
    base_pipeline = _pipeline(
        LinearSVC(
            class_weight="balanced",
            max_iter=5_000,
            random_state=config.random_seed,
        ),
        cache_dir / "base",
        max_features=config.type_router_max_features,
    )
    return TicketTypeRouterClassifier(base_estimator=base_pipeline)


def _joint_labels(queue: Any, priority: Any) -> np.ndarray:
    """Encode the two business outputs as one reversible training label."""
    return np.asarray(queue).astype(str) + "||" + np.asarray(priority).astype(str)


def _split_joint_label_array(labels: Any) -> tuple[np.ndarray, np.ndarray]:
    queues: list[str] = []
    priorities: list[str] = []
    for value in np.asarray(labels):
        text = str(value)
        if "||" not in text:
            raise ValueError("Joint labels must use the 'queue||priority' format.")
        queue, priority = text.split("||", 1)
        queues.append(queue)
        priorities.append(priority)
    return np.asarray(queues), np.asarray(priorities)


def _joint_macro_f1_scorer(estimator: Any, features: Any, labels: Any) -> float:
    """Select joint candidates by the average queue and priority macro F1."""
    predicted_queue, predicted_priority = _split_joint_label_array(estimator.predict(features))
    actual_queue, actual_priority = _split_joint_label_array(labels)
    return float(
        (
            f1_score(actual_queue, predicted_queue, average="macro", zero_division=0)
            + f1_score(actual_priority, predicted_priority, average="macro", zero_division=0)
        )
        / 2.0
    )


def _joint_accuracy_scorer(estimator: Any, features: Any, labels: Any) -> float:
    """Return exact joint-label accuracy for candidate comparison."""
    predictions = np.asarray(estimator.predict(features)).astype(str)
    return float(np.mean(predictions == np.asarray(labels).astype(str)))


def _joint_type_router_pipeline(config: TrainingConfig, cache_dir: Path) -> TicketTypeRouterClassifier:
    """Build the type-routed Linear SVM used for the joint label experiment."""
    base_pipeline = _pipeline(
        LinearSVC(
            class_weight="balanced",
            max_iter=5_000,
            random_state=config.random_seed,
        ),
        cache_dir / "base",
        max_features=config.joint_max_features,
    )
    return TicketTypeRouterClassifier(
        base_estimator=base_pipeline,
        decision_mode="marginal",
        score_temperature=config.joint_score_temperatures[0],
    )


def _train_type_router_target(
    target: str,
    target_train: Any,
    target_test: Any,
    dataset: PreparedDataset,
    split: DataSplit,
    config: TrainingConfig,
    artifact_dir: Path,
    report_dir: Path,
) -> TypeRouterTargetResult:
    cross_validation = StratifiedKFold(
        n_splits=config.cv_folds, shuffle=True, random_state=config.random_seed
    )
    search = GridSearchCV(
        estimator=_type_router_pipeline(
            config, config.cache_dir / "type_router_experiment" / target
        ),
        param_grid={
            "base_estimator__text__type_weight": list(config.type_router_weights),
            "base_estimator__tfidf__ngram_range": list(config.type_router_ngram_ranges),
            "base_estimator__tfidf__min_df": [1],
            "base_estimator__tfidf__max_df": [1.0],
            "base_estimator__classifier__C": list(config.type_router_c),
            "class_weight_power": list(config.type_router_class_weight_powers),
        },
        scoring={"macro_f1": "f1_macro", "accuracy": "accuracy"},
        cv=cross_validation,
        n_jobs=config.n_jobs,
        refit="macro_f1",
        return_train_score=False,
    )
    search.fit(split.x_train, target_train)

    candidate_results: list[dict[str, Any]] = []
    for index, params in enumerate(search.cv_results_["params"]):
        candidate_results.append(
            {
                "type_weight": int(params["base_estimator__text__type_weight"]),
                "c": float(params["base_estimator__classifier__C"]),
                "ngram_range": params["base_estimator__tfidf__ngram_range"],
                "class_weight_power": float(params["class_weight_power"]),
                "cv_macro_f1": float(search.cv_results_["mean_test_macro_f1"][index]),
                "cv_accuracy": float(search.cv_results_["mean_test_accuracy"][index]),
            }
        )

    calibration_enabled = target == "queue" and config.type_router_calibrate_queue
    calibration_bias: tuple[float, ...] | None = None
    if calibration_enabled:
        calibration_bias = tuple(
            float(value)
            for value in search.best_estimator_.fit_decision_bias(
                split.x_train,
                target_train,
                cv_folds=config.type_router_calibration_cv_folds,
                grid=config.type_router_calibration_grid,
                passes=config.type_router_calibration_passes,
                random_state=config.random_seed,
            )
        )

    evaluation = evaluate_pipeline(
        search.best_estimator_, split.x_test, target_test, target, report_dir
    )
    final_pipeline = clone(search.best_estimator_)
    final_target = dataset.queue if target == "queue" else dataset.priority
    final_pipeline.fit(dataset.features, final_target)
    if calibration_enabled:
        final_pipeline.fit_decision_bias(
            dataset.features,
            final_target,
            cv_folds=config.type_router_calibration_cv_folds,
            grid=config.type_router_calibration_grid,
            passes=config.type_router_calibration_passes,
            random_state=config.random_seed,
        )
    joblib.dump(final_pipeline, artifact_dir / f"{target}_pipeline.joblib", compress=3)
    best_params = search.best_params_
    return TypeRouterTargetResult(
        target=target,
        selected_type_weight=int(best_params["base_estimator__text__type_weight"]),
        selected_c=float(best_params["base_estimator__classifier__C"]),
        selected_ngram_range=tuple(best_params["base_estimator__tfidf__ngram_range"]),
        selected_class_weight_power=float(best_params["class_weight_power"]),
        calibration_enabled=calibration_enabled,
        calibration_bias=calibration_bias,
        selected_cv_macro_f1=float(search.best_score_),
        selected_cv_accuracy=float(search.cv_results_["mean_test_accuracy"][search.best_index_]),
        holdout_metrics=evaluation.metrics,
        misclassified_count=evaluation.misclassified_count,
        candidate_results=tuple(candidate_results),
    )


def tune_type_router(config: TrainingConfig) -> TypeRouterExperimentSummary:
    """Tune and persist the routed per-ticket-type Linear SVM experiment."""
    ensure_nltk_resources()
    experiment_artifact_dir = config.artifact_dir / "experiments" / "type_router"
    experiment_report_dir = config.report_dir / "type_router_experiment"
    experiment_artifact_dir.mkdir(parents=True, exist_ok=True)
    experiment_report_dir.mkdir(parents=True, exist_ok=True)

    dataset = load_and_prepare(config)
    split = make_train_test_split(dataset, config)
    queue = _train_type_router_target(
        "queue",
        split.queue_train,
        split.queue_test,
        dataset,
        split,
        config,
        experiment_artifact_dir,
        experiment_report_dir,
    )
    priority = _train_type_router_target(
        "priority",
        split.priority_train,
        split.priority_test,
        dataset,
        split,
        config,
        experiment_artifact_dir,
        experiment_report_dir,
    )
    summary = TypeRouterExperimentSummary(
        artifact_dir=experiment_artifact_dir,
        report_dir=experiment_report_dir,
        queue=queue,
        priority=priority,
    )
    _write_json(experiment_report_dir / "metrics.json", summary.as_dict())
    return summary


def tune_joint_type(
    config: TrainingConfig,
    *,
    artifact_dir: Path | None = None,
    report_dir: Path | None = None,
    cache_dir: Path | None = None,
) -> JointTypeExperimentSummary:
    """Train and persist the deployable joint queue/priority classifier.

    The experiment predicts a reversible ``queue||priority`` label.  This lets
    the model use correlations between the two business outputs while keeping
    the customer-selected type as the only additional input.  Selection uses
    only five-fold CV on the training portion; the holdout is evaluated once
    after the best parameter set has been selected.
    """
    ensure_nltk_resources()
    # Unlike exploratory variants, the selected joint pipeline is a deployable
    # model. Keep it separate from experiments and from the two-pipeline model.
    experiment_artifact_dir = artifact_dir or (config.artifact_dir / "joint")
    experiment_report_dir = report_dir or (config.report_dir / "joint_type_experiment")
    experiment_cache_dir = cache_dir or (config.cache_dir / "joint_type_experiment")
    experiment_artifact_dir.mkdir(parents=True, exist_ok=True)
    experiment_report_dir.mkdir(parents=True, exist_ok=True)

    dataset = load_and_prepare(config)
    split = make_train_test_split(dataset, config)
    train_labels = _joint_labels(split.queue_train, split.priority_train)
    cross_validation = StratifiedKFold(
        n_splits=config.cv_folds, shuffle=True, random_state=config.random_seed
    )
    search = GridSearchCV(
        estimator=_joint_type_router_pipeline(
            config, experiment_cache_dir
        ),
        param_grid={
            "base_estimator__text__type_weight": list(config.joint_type_weights),
            "base_estimator__tfidf__ngram_range": list(config.joint_ngram_ranges),
            "base_estimator__tfidf__min_df": [1],
            "base_estimator__tfidf__max_df": [1.0],
            "base_estimator__classifier__C": list(config.joint_c),
            "class_weight_power": list(config.joint_class_weight_powers),
            "score_temperature": list(config.joint_score_temperatures),
        },
        scoring={"macro_f1": _joint_macro_f1_scorer, "accuracy": _joint_accuracy_scorer},
        cv=cross_validation,
        n_jobs=config.n_jobs,
        refit="macro_f1",
        return_train_score=False,
    )
    search.fit(split.x_train, train_labels)

    candidate_results: list[dict[str, Any]] = []
    for index, params in enumerate(search.cv_results_["params"]):
        # GridSearchCV does not retain every fitted estimator.  The selected
        # candidate is evaluated below; CV scores are still recorded for all
        # parameter combinations, which is the leakage-safe selection signal.
        candidate_results.append(
            {
                "type_weight": int(params["base_estimator__text__type_weight"]),
                "c": float(params["base_estimator__classifier__C"]),
                "ngram_range": params["base_estimator__tfidf__ngram_range"],
                "class_weight_power": float(params["class_weight_power"]),
                "score_temperature": float(params["score_temperature"]),
                "cv_macro_f1": float(search.cv_results_["mean_test_macro_f1"][index]),
                "cv_accuracy": float(search.cv_results_["mean_test_accuracy"][index]),
            }
        )

    selected_pipeline, confidence_method = _fit_deployable_pipeline(
        search.best_estimator_,
        "linear_svm_joint_by_type",
        "joint",
        split.x_train,
        train_labels,
        config,
    )
    selected_evaluation = evaluate_joint_pipeline(
        selected_pipeline,
        split.x_test,
        split.queue_test,
        split.priority_test,
        experiment_report_dir,
    )
    final_pipeline, _ = _fit_deployable_pipeline(
        search.best_estimator_,
        "linear_svm_joint_by_type",
        "joint",
        dataset.features,
        _joint_labels(dataset.queue, dataset.priority),
        config,
    )
    joblib.dump(final_pipeline, experiment_artifact_dir / "joint_pipeline.joblib", compress=3)

    summary = JointTypeExperimentSummary(
        artifact_dir=experiment_artifact_dir,
        report_dir=experiment_report_dir,
        selected_params=_json_safe(search.best_params_),
        selected_cv_macro_f1=float(search.best_score_),
        selected_cv_accuracy=float(
            search.cv_results_["mean_test_accuracy"][search.best_index_]
        ),
        holdout_queue_metrics=selected_evaluation.queue.metrics,
        holdout_priority_metrics=selected_evaluation.priority.metrics,
        queue_misclassified_count=selected_evaluation.queue.misclassified_count,
        priority_misclassified_count=selected_evaluation.priority.misclassified_count,
        joint_accuracy=selected_evaluation.joint_accuracy,
        candidate_results=tuple(candidate_results),
        confidence_method=confidence_method,
    )
    _write_json(experiment_report_dir / "metrics.json", summary.as_dict())
    _write_json(
        experiment_artifact_dir / "metadata.json",
        {
            "trained_at_utc": datetime.now(UTC).isoformat(),
            "dataset": {
                "path": str(config.dataset_path),
                "sha256": dataset.source_sha256,
                **dataset.summary,
            },
            "labels": {
                "queue": sorted(str(label) for label in dataset.queue.unique()),
                "priority": sorted(str(label) for label in dataset.priority.unique()),
                "joint": sorted(str(label) for label in np.unique(train_labels)),
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
        },
    )
    return summary


def _type_onehot_pipeline(config: TrainingConfig, cache_dir: Path) -> Pipeline:
    text_branch = Pipeline(
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
    type_branch = Pipeline([("onehot", TicketTypeOneHot())])
    return Pipeline(
        [
            (
                "features",
                FeatureUnion(
                    [("text", text_branch), ("type", type_branch)],
                    transformer_weights={"text": 1.0, "type": 1.0},
                ),
            ),
            (
                "classifier",
                LinearSVC(
                    class_weight="balanced",
                    max_iter=5_000,
                    random_state=config.random_seed,
                ),
            ),
        ],
        memory=joblib.Memory(cache_dir, verbose=0),
    )


def _train_type_onehot_target(
    target: str,
    target_train: Any,
    target_test: Any,
    dataset: PreparedDataset,
    split: DataSplit,
    config: TrainingConfig,
    artifact_dir: Path,
    report_dir: Path,
) -> TypeOneHotTargetResult:
    cross_validation = StratifiedKFold(
        n_splits=config.cv_folds, shuffle=True, random_state=config.random_seed
    )
    baseline = _pipeline(
        LinearSVC(C=10.0, class_weight="balanced", random_state=config.random_seed),
        config.cache_dir / "type_onehot_experiment" / target / "baseline",
    )
    baseline.set_params(
        tfidf__ngram_range=(1, 3),
        tfidf__min_df=1,
        tfidf__max_df=1.0,
    )
    baseline.fit(split.x_train, target_train)
    baseline_metrics = score_predictions(target_test, baseline.predict(split.x_test))

    search = GridSearchCV(
        estimator=_type_onehot_pipeline(
            config, config.cache_dir / "type_onehot_experiment" / target
        ),
        param_grid={
            "features__transformer_weights": [
                {"text": 1.0, "type": weight}
                for weight in config.type_onehot_weights
            ],
            "classifier__C": list(config.type_svm_c),
        },
        scoring={"macro_f1": "f1_macro", "accuracy": "accuracy"},
        cv=cross_validation,
        n_jobs=config.n_jobs,
        refit="macro_f1",
        return_train_score=False,
    )
    search.fit(split.x_train, target_train)

    candidate_results: list[dict[str, Any]] = []
    for index, params in enumerate(search.cv_results_["params"]):
        candidate_results.append(
            {
                "type_feature_weight": float(
                    params["features__transformer_weights"]["type"]
                ),
                "c": float(params["classifier__C"]),
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
    joblib.dump(final_pipeline, artifact_dir / f"{target}_pipeline.joblib", compress=3)
    best_params = search.best_params_
    return TypeOneHotTargetResult(
        target=target,
        selected_type_feature_weight=float(
            best_params["features__transformer_weights"]["type"]
        ),
        selected_c=float(best_params["classifier__C"]),
        selected_cv_macro_f1=float(search.best_score_),
        selected_cv_accuracy=float(
            search.cv_results_["mean_test_accuracy"][search.best_index_]
        ),
        baseline_holdout_metrics=baseline_metrics,
        onehot_holdout_metrics=evaluation.metrics,
        misclassified_count=evaluation.misclassified_count,
        candidate_results=tuple(candidate_results),
    )


def tune_type_onehot(config: TrainingConfig) -> TypeOneHotExperimentSummary:
    """Tune an explicit one-hot type feature with a separate feature weight."""
    ensure_nltk_resources()
    experiment_artifact_dir = config.artifact_dir / "experiments" / "type_onehot"
    experiment_report_dir = config.report_dir / "type_onehot_experiment"
    experiment_artifact_dir.mkdir(parents=True, exist_ok=True)
    experiment_report_dir.mkdir(parents=True, exist_ok=True)

    dataset = load_and_prepare(config)
    split = make_train_test_split(dataset, config)
    queue = _train_type_onehot_target(
        "queue",
        split.queue_train,
        split.queue_test,
        dataset,
        split,
        config,
        experiment_artifact_dir,
        experiment_report_dir,
    )
    priority = _train_type_onehot_target(
        "priority",
        split.priority_train,
        split.priority_test,
        dataset,
        split,
        config,
        experiment_artifact_dir,
        experiment_report_dir,
    )
    summary = TypeOneHotExperimentSummary(
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


def _fit_type_router_decision_bias_if_required(
    pipeline: Any,
    candidate_name: str,
    target: str,
    features: pd.DataFrame,
    labels: Any,
    config: TrainingConfig,
) -> None:
    """Retain the queue-only macro-F1 offsets used by the selected router."""
    if not (
        candidate_name == "linear_svm_by_type"
        and target == "queue"
        and config.type_router_calibrate_queue
    ):
        return
    if not isinstance(pipeline, TicketTypeRouterClassifier):
        raise TypeError("The type-router decision calibration requires a routed SVM.")
    pipeline.fit_decision_bias(
        features,
        labels,
        cv_folds=config.type_router_calibration_cv_folds,
        grid=config.type_router_calibration_grid,
        passes=config.type_router_calibration_passes,
        random_state=config.random_seed,
    )


def _fit_deployable_pipeline(
    estimator: Any,
    candidate_name: str,
    target: str,
    features: pd.DataFrame,
    labels: Any,
    config: TrainingConfig,
) -> tuple[Any, str]:
    """Fit an artifact and add probabilities when the selected model is an SVM.

    Candidate selection remains based on the uncalibrated candidate inside its
    outer cross-validation folds. Calibration is fitted only after a winner is
    known and only from the training partition, avoiding holdout leakage.
    """
    if candidate_name.startswith("linear_svm") and config.svm_probability_calibration:
        calibrated = CalibratedSVMClassifier(
            estimator=clone(estimator),
            cv_folds=config.svm_probability_calibration_cv_folds,
            method=config.svm_probability_calibration_method,
            random_state=config.random_seed,
            n_jobs=config.n_jobs,
        ).fit(features, labels)
        _fit_type_router_decision_bias_if_required(
            calibrated.estimator_, candidate_name, target, features, labels, config
        )
        return calibrated, calibrated.calibration_method_

    fitted = clone(estimator).fit(features, labels)
    _fit_type_router_decision_bias_if_required(
        fitted, candidate_name, target, features, labels, config
    )
    if hasattr(fitted, "predict_proba"):
        return fitted, "model_probability"
    return fitted, "unavailable"


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
    selected_pipeline, confidence_method = _fit_deployable_pipeline(
        selected_search.best_estimator_,
        selected_name,
        target,
        split.x_train,
        target_train,
        config,
    )
    evaluation: EvaluationResult = evaluate_pipeline(
        selected_pipeline, split.x_test, target_test, target, config.report_dir
    )
    final_target = dataset.queue if target == "queue" else dataset.priority
    final_pipeline, _ = _fit_deployable_pipeline(
        selected_search.best_estimator_,
        selected_name,
        target,
        dataset.features,
        final_target,
        config,
    )
    joblib.dump(final_pipeline, config.artifact_dir / f"{target}_pipeline.joblib", compress=3)
    return TargetTrainingResult(
        target=target,
        selected_model=selected_name,
        cv_macro_f1=float(selected_search.best_score_),
        best_params=_json_safe(selected_search.best_params_),
        holdout_metrics=evaluation.metrics,
        misclassified_count=evaluation.misclassified_count,
        candidate_results=tuple(candidate_results),
        confidence_method=confidence_method,
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
