"""Holdout evaluation, visualizations, and error-analysis exports."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    classification_report,
    confusion_matrix,
    precision_recall_curve,
    precision_recall_fscore_support,
    roc_curve,
)
from sklearn.preprocessing import label_binarize


@dataclass(frozen=True)
class EvaluationResult:
    metrics: dict[str, float]
    classification_report: dict[str, Any]
    misclassified_count: int


@dataclass(frozen=True)
class JointEvaluationResult:
    """Evaluation for a model that emits one ``queue||priority`` label."""

    queue: EvaluationResult
    priority: EvaluationResult
    joint_accuracy: float


def score_predictions(target_values: pd.Series, predictions: np.ndarray) -> dict[str, float]:
    """Return the scalar metrics used for candidate comparison and quality gates."""
    macro_precision, macro_recall, macro_f1, _ = precision_recall_fscore_support(
        target_values, predictions, average="macro", zero_division=0
    )
    weighted_precision, weighted_recall, weighted_f1, _ = precision_recall_fscore_support(
        target_values, predictions, average="weighted", zero_division=0
    )
    return {
        "accuracy": float(accuracy_score(target_values, predictions)),
        "macro_precision": float(macro_precision),
        "macro_recall": float(macro_recall),
        "macro_f1": float(macro_f1),
        "weighted_precision": float(weighted_precision),
        "weighted_recall": float(weighted_recall),
        "weighted_f1": float(weighted_f1),
    }


def _write_json(path: Path, content: dict[str, Any]) -> None:
    path.write_text(json.dumps(content, indent=2, sort_keys=True), encoding="utf-8")


def _prediction_scores(
    pipeline: Any, features: pd.DataFrame
) -> tuple[np.ndarray, np.ndarray] | None:
    classifier = (
        pipeline.named_steps["classifier"]
        if hasattr(pipeline, "named_steps")
        else pipeline
    )
    classes = np.asarray(classifier.classes_)
    if hasattr(pipeline, "predict_proba"):
        return classes, np.asarray(pipeline.predict_proba(features))
    if hasattr(pipeline, "decision_function"):
        scores = np.asarray(pipeline.decision_function(features))
        if scores.ndim == 1:
            scores = np.column_stack((-scores, scores))
        return classes, scores
    return None


def _save_confusion_matrix(
    y_true: pd.Series, y_pred: np.ndarray, classes: list[str], target: str, report_dir: Path
) -> None:
    matrix = confusion_matrix(y_true, y_pred, labels=classes)
    figure, axis = plt.subplots(figsize=(max(7, len(classes)), max(5, len(classes) * 0.8)))
    sns.heatmap(
        matrix,
        annot=True,
        fmt="d",
        cmap="Blues",
        cbar=False,
        xticklabels=classes,
        yticklabels=classes,
        ax=axis,
    )
    axis.set_title(f"{target.title()} prediction confusion matrix")
    axis.set_xlabel("Predicted label")
    axis.set_ylabel("Actual label")
    figure.tight_layout()
    figure.savefig(report_dir / f"{target}_confusion_matrix.png", dpi=200)
    plt.close(figure)


def _save_roc_pr_curves(
    pipeline: Any, features: pd.DataFrame, y_true: pd.Series, target: str, report_dir: Path
) -> None:
    scored = _prediction_scores(pipeline, features)
    if scored is None:
        return

    classes, scores = scored
    _save_roc_pr_curves_from_scores(classes, scores, y_true, target, report_dir)


def _save_roc_pr_curves_from_scores(
    classes: np.ndarray,
    scores: np.ndarray,
    y_true: pd.Series,
    target: str,
    report_dir: Path,
) -> None:
    """Persist ROC/PR curves when scores have already been transformed."""
    binary_labels = label_binarize(y_true, classes=classes)
    if len(classes) == 2:
        binary_labels = np.column_stack((1 - binary_labels, binary_labels))

    figure, axes = plt.subplots(1, 2, figsize=(15, 6))
    for index, label in enumerate(classes):
        truth = binary_labels[:, index]
        if truth.min() == truth.max():
            continue
        false_positive_rate, true_positive_rate, _ = roc_curve(truth, scores[:, index])
        precision, recall, _ = precision_recall_curve(truth, scores[:, index])
        average_precision = average_precision_score(truth, scores[:, index])
        axes[0].plot(false_positive_rate, true_positive_rate, label=str(label))
        axes[1].plot(recall, precision, label=f"{label} (AP={average_precision:.2f})")

    axes[0].plot([0, 1], [0, 1], linestyle="--", color="grey", label="Chance")
    axes[0].set(
        title=f"{target.title()} one-vs-rest ROC",
        xlabel="False positive rate",
        ylabel="True positive rate",
    )
    axes[1].set(
        title=f"{target.title()} one-vs-rest precision-recall",
        xlabel="Recall",
        ylabel="Precision",
    )
    for axis in axes:
        axis.legend(fontsize="small", loc="best")
    figure.tight_layout()
    figure.savefig(report_dir / f"{target}_roc_pr_curves.png", dpi=200)
    plt.close(figure)


def _evaluate_predictions(
    features: pd.DataFrame,
    target_values: pd.Series,
    predictions: np.ndarray,
    target_name: str,
    report_dir: Path,
    scores: tuple[np.ndarray, np.ndarray] | None = None,
) -> EvaluationResult:
    """Evaluate already-decoded predictions and optionally their class scores."""
    labels = sorted(str(label) for label in target_values.unique())
    report = classification_report(
        target_values, predictions, labels=labels, output_dict=True, zero_division=0
    )
    metrics = score_predictions(target_values, predictions)
    if target_name == "priority" and "high" in report:
        metrics["high_priority_recall"] = float(report["high"]["recall"])

    _write_json(report_dir / f"{target_name}_classification_report.json", report)
    _save_confusion_matrix(target_values, predictions, labels, target_name, report_dir)
    if scores is not None:
        _save_roc_pr_curves_from_scores(scores[0], scores[1], target_values, target_name, report_dir)

    errors = features.copy()
    errors["actual_label"] = target_values.to_numpy()
    errors["predicted_label"] = predictions
    errors = errors.loc[errors["actual_label"] != errors["predicted_label"]]
    errors.to_csv(report_dir / f"{target_name}_misclassifications.csv", index=False)
    return EvaluationResult(
        metrics=metrics, classification_report=report, misclassified_count=len(errors)
    )


def evaluate_pipeline(
    pipeline: Any,
    features: pd.DataFrame,
    target_values: pd.Series,
    target_name: str,
    report_dir: Path,
) -> EvaluationResult:
    """Evaluate once on the untouched test set and persist reviewer-friendly evidence."""
    report_dir.mkdir(parents=True, exist_ok=True)
    predictions = np.asarray(pipeline.predict(features))
    return _evaluate_predictions(
        features,
        target_values,
        predictions,
        target_name,
        report_dir,
        scores=_prediction_scores(pipeline, features),
    )


def _split_joint_labels(labels: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    queues: list[str] = []
    priorities: list[str] = []
    for label in labels:
        value = str(label)
        if "||" not in value:
            raise ValueError("Joint labels must use the 'queue||priority' format.")
        queue, priority = value.split("||", 1)
        queues.append(queue)
        priorities.append(priority)
    return np.asarray(queues), np.asarray(priorities)


def _aggregate_joint_scores(
    classes: np.ndarray, scores: np.ndarray, target: str, labels: list[str]
) -> np.ndarray:
    """Aggregate joint decision scores into queue or priority scores."""
    if scores.ndim == 1:
        scores = np.column_stack((-scores, scores))
    joint_queues, joint_priorities = _split_joint_labels(classes)
    selected = joint_queues if target == "queue" else joint_priorities
    aggregated = np.full((len(scores), len(labels)), -np.inf, dtype=float)
    for index, label in enumerate(labels):
        matching = selected == label
        if bool(matching.any()):
            aggregated[:, index] = np.max(scores[:, matching], axis=1)
    return aggregated


def evaluate_joint_pipeline(
    pipeline: Any,
    features: pd.DataFrame,
    queue_values: pd.Series,
    priority_values: pd.Series,
    report_dir: Path,
) -> JointEvaluationResult:
    """Evaluate one joint classifier as separate queue and priority outputs."""
    report_dir.mkdir(parents=True, exist_ok=True)
    joint_predictions = np.asarray(pipeline.predict(features)).astype(str)
    predicted_queue, predicted_priority = _split_joint_labels(joint_predictions)
    queue_labels = sorted(str(label) for label in queue_values.unique())
    priority_labels = sorted(str(label) for label in priority_values.unique())

    scored = _prediction_scores(pipeline, features)
    queue_scores: tuple[np.ndarray, np.ndarray] | None = None
    priority_scores: tuple[np.ndarray, np.ndarray] | None = None
    if scored is not None:
        classes, raw_scores = scored
        queue_scores = (
            np.asarray(queue_labels),
            _aggregate_joint_scores(classes, raw_scores, "queue", queue_labels),
        )
        priority_scores = (
            np.asarray(priority_labels),
            _aggregate_joint_scores(classes, raw_scores, "priority", priority_labels),
        )

    queue_result = _evaluate_predictions(
        features,
        queue_values,
        predicted_queue,
        "queue",
        report_dir,
        scores=queue_scores,
    )
    priority_result = _evaluate_predictions(
        features,
        priority_values,
        predicted_priority,
        "priority",
        report_dir,
        scores=priority_scores,
    )
    actual_joint = queue_values.astype(str) + "||" + priority_values.astype(str)
    return JointEvaluationResult(
        queue=queue_result,
        priority=priority_result,
        joint_accuracy=float(accuracy_score(actual_joint, joint_predictions)),
    )
