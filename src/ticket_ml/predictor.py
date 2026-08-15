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

    def __init__(self, queue_pipeline: Any, priority_pipeline: Any) -> None:
        self._queue_pipeline = queue_pipeline
        self._priority_pipeline = priority_pipeline

    @classmethod
    def load(cls, model_dir: str | Path) -> TicketPredictor:
        """Load only artifacts produced and trusted by this project."""
        artifact_dir = Path(model_dir)
        queue_path = artifact_dir / "queue_pipeline.joblib"
        priority_path = artifact_dir / "priority_pipeline.joblib"
        missing = [str(path) for path in (queue_path, priority_path) if not path.is_file()]
        if missing:
            raise FileNotFoundError(f"Missing model artifact(s): {', '.join(missing)}")
        return cls(joblib.load(queue_path), joblib.load(priority_path))

    def predict(self, subject: str, body: str) -> TicketPrediction:
        """Return a queue and priority for a ticket with a non-empty body."""
        if not body or not body.strip():
            raise ValueError("Ticket body must not be empty.")
        ticket = pd.DataFrame({"subject": [subject or ""], "body": [body]})
        return TicketPrediction(
            queue=str(self._queue_pipeline.predict(ticket)[0]),
            priority=str(self._priority_pipeline.predict(ticket)[0]),
        )
