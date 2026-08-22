from __future__ import annotations

from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.db.models import Count
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from web.accounts.models import User
from web.reporting.queries import period_bounds
from web.tickets.models import PredictionRecord

from .evaluation import live_model_metrics
from .models import ModelDeployment
from .services import PredictionService, active_model_family


def _admin_only(request):
    return request.user.is_authenticated and request.user.role == User.Role.ADMIN


@login_required
@require_GET
def deployments(request):
    if not _admin_only(request):
        return JsonResponse({"detail": "Administrator access required."}, status=403)
    rows = list(ModelDeployment.objects.values(
        "family", "version", "artifact_directory", "queue_macro_f1", "priority_macro_f1", "priority_accuracy", "is_active", "is_fixed"
    ))
    for row in rows:
        for field in ("queue_macro_f1", "priority_macro_f1", "priority_accuracy"):
            if row[field] is not None:
                row[field] = float(row[field])
        live = live_model_metrics(row["family"])
        row.update({f"live_{key}": value for key, value in live.items()})
        # Convenient top-level names for clients that render a model card;
        # the persisted queue_macro_f1 field remains the original holdout
        # score for the evidence register.
        row["reviewed_outcomes"] = live["reviewed_count"]
        row["live_queue_macro_f1"] = live["queue_macro_f1"]
        row["live_priority_macro_f1"] = live["priority_macro_f1"]
    return JsonResponse({"deployments": rows, "active_family": active_model_family()})


@login_required
@require_GET
def operational(request, family: str):
    if not _admin_only(request):
        return JsonResponse({"detail": "Administrator access required."}, status=403)
    family = str(family).lower()
    if family not in {ModelDeployment.Family.JOINT, ModelDeployment.Family.SEPARATE}:
        return JsonResponse({"detail": "Model family must be joint or separate."}, status=400)
    period = str(request.GET.get("period", "month"))
    try:
        start, end = period_bounds(period)
    except ValueError as exc:
        return JsonResponse({"detail": str(exc)}, status=400)
    rows = PredictionRecord.objects.filter(model_family=family, created_at__gte=start, created_at__lt=end)
    queue_rows = rows.values("predicted_queue").annotate(count=Count("id")).order_by("-count", "predicted_queue")
    priority_rows = rows.values("predicted_priority").annotate(count=Count("id"))
    priority_counts = {"high": 0, "medium": 0, "low": 0, "": 0}
    for row in priority_rows:
        key = str(row["predicted_priority"] or "").lower()
        priority_counts[key if key in priority_counts else ""] += row["count"]
    deployment = ModelDeployment.objects.filter(family=family).values("version", "queue_macro_f1", "priority_accuracy").first() or {}
    reviewed = live_model_metrics(family, start=start, end=end)
    return JsonResponse({
        "family": family,
        "period": period,
        "total": rows.count(),
        "reviewed_count": reviewed["reviewed_count"],
        "queue_predictions": [{"queue": row["predicted_queue"] or "Unclassified", "count": row["count"]} for row in queue_rows],
        "priority_predictions": [
            {"priority": label, "count": priority_counts.get(key, 0)}
            for key, label in (("high", "High"), ("medium", "Medium"), ("low", "Low"), ("", "Unclassified"))
            if priority_counts[key] or key != ""
        ],
        # These aliases are retained for the existing client contract. They
        # now represent live reviewed outcomes, not training holdout scores.
        "queue_accuracy": reviewed["queue_accuracy"],
        "priority_accuracy": reviewed["priority_accuracy"],
        "queue_macro_f1": reviewed["queue_macro_f1"],
        "priority_macro_f1": reviewed["priority_macro_f1"],
        "queue_wrong_count": reviewed["queue_wrong_count"],
        "priority_wrong_count": reviewed["priority_wrong_count"],
        "version": deployment.get("version", ""),
    })


@login_required
@require_POST
def activate_deployment(request, family: str):
    if not _admin_only(request):
        return JsonResponse({"detail": "Administrator access required."}, status=403)
    if family not in {ModelDeployment.Family.JOINT, ModelDeployment.Family.SEPARATE}:
        return JsonResponse({"detail": "Model family must be joint or separate."}, status=400)
    with transaction.atomic():
        selected = ModelDeployment.objects.select_for_update().filter(family=family).first()
        if selected is None:
            return JsonResponse({"detail": "That model deployment is not registered."}, status=404)
        ModelDeployment.objects.update(is_active=False)
        selected.is_active = True
        selected.selected_at = timezone.now()
        selected.save(update_fields=["is_active", "selected_at"])
    return JsonResponse({"active_family": active_model_family()})


@login_required
@require_POST
def predict(request):
    if request.user.role not in {User.Role.CUSTOMER, User.Role.STAFF, User.Role.ADMIN}:
        return JsonResponse({"detail": "Access denied."}, status=403)
    try:
        import json

        payload = json.loads(request.body or "{}")
        result = PredictionService().predict(
            str(payload.get("subject", "")),
            str(payload.get("body", "")),
            str(payload.get("issue_type", "")),
            family=payload.get("model_family"),
        )
        return JsonResponse({
            "queue": result.queue,
            "priority": result.priority,
            "queue_confidence_percent": result.queue_confidence_percent,
            "priority_confidence_percent": result.priority_confidence_percent,
            "confidence_method": result.confidence_method,
        })
    except Exception as exc:
        return JsonResponse({"detail": str(exc)}, status=422)
