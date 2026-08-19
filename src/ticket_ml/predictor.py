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
        if not body or not body.strip():
            raise ValueError("Ticket body must not be empty.")
        ticket = pd.DataFrame(
            {"subject": [subject or ""], "body": [body], "type": [ticket_type or ""]}
        )
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
