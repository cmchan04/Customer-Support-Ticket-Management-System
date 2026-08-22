"""Read-only adapter from ticket submissions to the existing ``ticket_ml`` package."""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from django.conf import settings

from ticket_ml.predictor import TicketPredictor, TicketScoredPrediction

from .models import ModelDeployment


def active_model_family() -> str:
    """Return the deployment selected for new submissions.

    The artifacts remain fixed; this only selects which already-registered
    artifact handles future submissions.
    """
    deployment = ModelDeployment.objects.filter(is_active=True).order_by("-selected_at", "-created_at").first()
    return deployment.family if deployment else str(settings.ACTIVE_MODEL_FAMILY).lower()


@dataclass(frozen=True)
class ModelPrediction:
    queue: str
    priority: str
    queue_confidence_percent: float | None
    priority_confidence_percent: float | None
    confidence_method: str
    model_version: str = ""


class PredictionService:
    """Small interface hiding model-directory selection and artifact loading."""

    def __init__(self, *, model_dir: Path | None = None, joint_model_dir: Path | None = None) -> None:
        self.model_dir = Path(model_dir or settings.MODEL_DIR)
        self.joint_model_dir = Path(joint_model_dir or settings.JOINT_MODEL_DIR)
        self.model_version = self._read_version()

    def predict(self, subject: str, body: str, issue_type: str, *, family: str | None = None) -> ModelPrediction:
        selected_family = (family or active_model_family()).lower()
        if selected_family not in {"joint", "separate"}:
            raise ValueError("Model family must be 'joint' or 'separate'.")
        predictor = self._load_predictor(selected_family)
        scored: TicketScoredPrediction = predictor.predict_scored(subject, body, issue_type)
        method = scored.queue_confidence_method
        if scored.priority_confidence_method != method:
            method = f"queue:{method};priority:{scored.priority_confidence_method}"
        return ModelPrediction(
            queue=scored.queue,
            priority=scored.priority,
            queue_confidence_percent=scored.queue_confidence_percent,
            priority_confidence_percent=scored.priority_confidence_percent,
            confidence_method=method,
            model_version=self._read_version(selected_family),
        )

    def clear_cache(self) -> None:
        self._load_predictor_for_directory.cache_clear()

    def _load_predictor(self, family: str) -> TicketPredictor:
        directory = self.joint_model_dir if family == "joint" else self.model_dir
        return self._load_predictor_for_directory(str(directory.resolve()))

    @staticmethod
    @lru_cache(maxsize=2)
    def _load_predictor_for_directory(directory: str) -> TicketPredictor:
        """Cache artifacts across request-scoped PredictionService instances."""
        return TicketPredictor.load(Path(directory))

    def _read_version(self, family: str | None = None) -> str:
        selected_family = family or active_model_family()
        metadata_path = (self.joint_model_dir if selected_family == "joint" else self.model_dir) / "metadata.json"
        if metadata_path.is_file():
            try:
                metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
                return str(metadata.get("trained_at_utc") or settings.MODEL_VERSION)
            except (OSError, ValueError):
                pass
        return str(settings.MODEL_VERSION)
