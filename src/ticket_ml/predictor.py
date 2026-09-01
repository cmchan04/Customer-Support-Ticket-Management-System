"""Stable prediction interface for the CLI and future Django adapter."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import pandas as pd


@dataclass(frozen=True)
class TicketPrediction:
    queue: str
    priority: str


@dataclass(frozen=True)
class TicketScoredPrediction:
    """Prediction labels with calibrated confidence percentages when available."""

    queue: str
    priority: str
    queue_confidence_percent: float | None
    priority_confidence_percent: float | None
    queue_confidence_method: str
    priority_confidence_method: str


class TicketPredictor:
    """Loads two trusted local pipelines and predicts labels for one submitted ticket."""

    def __init__(
        self,
        queue_pipeline: Any | None,
        priority_pipeline: Any | None,
        joint_pipeline: Any | None = None,
    ) -> None:
        self._queue_pipeline = queue_pipeline
        self._priority_pipeline = priority_pipeline
        self._joint_pipeline = joint_pipeline

    @classmethod
    def load(cls, model_dir: str | Path) -> TicketPredictor:
        """Load only artifacts produced and trusted by this project."""
        artifact_dir = Path(model_dir)
        joint_path = artifact_dir / "joint_pipeline.joblib"
        if joint_path.is_file():
            return cls(None, None, joint_pipeline=joblib.load(joint_path))

        queue_path = artifact_dir / "queue_pipeline.joblib"
        priority_path = artifact_dir / "priority_pipeline.joblib"
        missing = [str(path) for path in (queue_path, priority_path) if not path.is_file()]
        if missing:
            raise FileNotFoundError(f"Missing model artifact(s): {', '.join(missing)}")
        return cls(joblib.load(queue_path), joblib.load(priority_path))

    def predict(self, subject: str, body: str, ticket_type: str = "") -> TicketPrediction:
        """Return a queue and priority for a ticket with a non-empty body."""
        return self._predict_ticket(self._ticket_frame(subject, body, ticket_type))

    def predict_scored(
        self, subject: str, body: str, ticket_type: str = ""
    ) -> TicketScoredPrediction:
        """Return labels and calibrated confidence percentages where supported.

        Artifacts trained before SVM probability calibration remain usable, but
        report ``None`` and ``"unavailable"`` until they are retrained.
        """
        ticket = self._ticket_frame(subject, body, ticket_type)
        prediction = self._predict_ticket(ticket)
        if self._joint_pipeline is not None:
            queue_confidence, priority_confidence, method = self._joint_confidences(
                ticket, prediction.queue, prediction.priority
            )
            return TicketScoredPrediction(
                queue=prediction.queue,
                priority=prediction.priority,
                queue_confidence_percent=queue_confidence,
                priority_confidence_percent=priority_confidence,
                queue_confidence_method=method,
                priority_confidence_method=method,
            )

        if self._queue_pipeline is None or self._priority_pipeline is None:
            raise ValueError("TicketPredictor has no queue and priority pipelines.")
        queue_confidence, queue_method = self._label_confidence(
            self._queue_pipeline, ticket, prediction.queue
        )
        priority_confidence, priority_method = self._label_confidence(
            self._priority_pipeline, ticket, prediction.priority
        )
        return TicketScoredPrediction(
            queue=prediction.queue,
            priority=prediction.priority,
            queue_confidence_percent=queue_confidence,
            priority_confidence_percent=priority_confidence,
            queue_confidence_method=queue_method,
            priority_confidence_method=priority_method,
        )

    @staticmethod
    def _ticket_frame(subject: str, body: str, ticket_type: str) -> pd.DataFrame:
        if not body or not body.strip():
            raise ValueError("Ticket body must not be empty.")
        return pd.DataFrame(
            {"subject": [subject or ""], "body": [body], "type": [ticket_type or ""]}
        )

    def _predict_ticket(self, ticket: pd.DataFrame) -> TicketPrediction:
        if self._joint_pipeline is not None:
            joint_label = str(self._joint_pipeline.predict(ticket)[0])
            if "||" not in joint_label:
                raise ValueError("Joint model returned an invalid queue||priority label.")
            queue, priority = joint_label.split("||", 1)
            return TicketPrediction(queue=queue, priority=priority)

        if self._queue_pipeline is None or self._priority_pipeline is None:
            raise ValueError("TicketPredictor has no queue and priority pipelines.")
        return TicketPrediction(
            queue=str(self._queue_pipeline.predict(ticket)[0]),
            priority=str(self._priority_pipeline.predict(ticket)[0]),
        )

    @staticmethod
    def _label_confidence(
        pipeline: Any, ticket: pd.DataFrame, label: str
    ) -> tuple[float | None, str]:
        if not hasattr(pipeline, "predict_proba"):
            return None, "unavailable"
        classifier = pipeline.named_steps["classifier"] if hasattr(pipeline, "named_steps") else pipeline
        probabilities = pipeline.predict_proba(ticket)[0]
        classes = list(classifier.classes_)
        if label not in classes:
            return None, "unavailable"
        confidence = float(probabilities[classes.index(label)] * 100)
        method = getattr(classifier, "calibration_method_", "model_probability")
        return round(confidence, 2), str(method)

    def _joint_confidences(
        self, ticket: pd.DataFrame, queue: str, priority: str
    ) -> tuple[float | None, float | None, str]:
        if self._joint_pipeline is None or not hasattr(self._joint_pipeline, "predict_proba"):
            return None, None, "unavailable"
        classifier = (
            self._joint_pipeline.named_steps["classifier"]
            if hasattr(self._joint_pipeline, "named_steps")
            else self._joint_pipeline
        )
        probabilities = self._joint_pipeline.predict_proba(ticket)[0]
        queue_confidence = 0.0
        priority_confidence = 0.0
        for label, probability in zip(classifier.classes_, probabilities, strict=True):
            value = str(label)
            if "||" not in value:
                continue
            predicted_queue, predicted_priority = value.split("||", 1)
            if predicted_queue == queue:
                queue_confidence += float(probability)
            if predicted_priority == priority:
                priority_confidence += float(probability)
        method = getattr(classifier, "calibration_method_", "model_probability")
        return round(queue_confidence * 100, 2), round(priority_confidence * 100, 2), str(method)
