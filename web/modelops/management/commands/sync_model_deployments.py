from __future__ import annotations

import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from web.modelops.models import ModelDeployment


class Command(BaseCommand):
    help = "Register the fixed joint and separate Joblib artifacts for the Admin model centre."

    def handle(self, *args, **options):
        active_family = (
            ModelDeployment.objects.filter(is_active=True)
            .values_list("family", flat=True)
            .first()
            or settings.ACTIVE_MODEL_FAMILY
        )
        for family, directory in (("separate", settings.MODEL_DIR), ("joint", settings.JOINT_MODEL_DIR)):
            metadata_path = Path(directory) / "metadata.json"
            metadata = {}
            if metadata_path.is_file():
                try:
                    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
                except (OSError, ValueError):
                    metadata = {}
            results = metadata.get("results", {})
            queue = results.get("queue", {})
            priority = results.get("priority", {})
            queue_holdout = queue.get("holdout_metrics", {}) or results.get("holdout_queue_metrics", {})
            priority_holdout = priority.get("holdout_metrics", {}) or results.get("holdout_priority_metrics", {})
            deployment, _ = ModelDeployment.objects.update_or_create(
                family=family,
                defaults={
                    "version": str(metadata.get("trained_at_utc") or "local-artifact"),
                    "artifact_directory": str(directory),
                    "queue_macro_f1": queue_holdout.get("macro_f1"),
                    "priority_macro_f1": priority_holdout.get("macro_f1"),
                    "priority_accuracy": priority_holdout.get("accuracy"),
                    "is_active": family == active_family,
                    "is_fixed": True,
                    "selected_at": timezone.now(),
                },
            )
            self.stdout.write(f"Registered {deployment.get_family_display()} model: {deployment.version}")
