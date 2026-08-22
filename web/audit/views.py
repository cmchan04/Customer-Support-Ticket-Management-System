from __future__ import annotations

from django.contrib.auth.decorators import login_required
from django.db.models import Q
from django.http import JsonResponse
from django.views.decorators.http import require_GET

from web.accounts.models import User

from .models import AuditEvent


@login_required
@require_GET
def activity(request):
    if request.user.role != User.Role.ADMIN:
        return JsonResponse({"detail": "Administrator access required."}, status=403)
    category = str(request.GET.get("category", "all"))
    search = str(request.GET.get("q", "")).strip()
    events = AuditEvent.objects.select_related("actor").all()
    if category != "all":
        category_value = {label: value for value, label in AuditEvent.Category.choices}.get(category, category.upper())
        events = events.filter(category=category_value)
    if search:
        events = events.filter(
            Q(action__icontains=search)
            | Q(object_type__icontains=search)
            | Q(object_id__icontains=search)
            | Q(actor__first_name__icontains=search)
            | Q(actor__last_name__icontains=search)
            | Q(actor__email__icontains=search)
        )
    total = events.count()
    events = events[:500]
    return JsonResponse({
        "total": total,
        "events": [
            {
                "id": event.pk,
                "timestamp": event.created_at.isoformat(),
                "actor": event.actor.get_full_name() if event.actor_id else "System",
                "category": event.category,
                "action": event.action,
                "record": event.object_id,
                "detail": event.detail,
            }
            for event in events
        ]
    })
