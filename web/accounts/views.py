from __future__ import annotations

import json

from django.conf import settings
from django.contrib.auth import update_session_auth_hash
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import PasswordChangeForm
from django.core.exceptions import PermissionDenied, ValidationError
from django.http import HttpResponse, JsonResponse
from django.middleware.csrf import get_token
from django.shortcuts import render
from django.urls import reverse
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from web.audit.models import AuditEvent
from web.tickets.models import Queue, StaffAssignment

from .models import User
from .services import StaffDirectory


@login_required
@never_cache
def home(request):
    """Render the established prototype as the authenticated Django shell.

    The prototype remains usable as a standalone file, so its small server
    bootstrap is injected only for a logged-in Django response.  The injected
    data supplies the real account identity and a CSRF-protected logout path;
    application actions continue to use the JSON API seams.
    """
    role = request.user.role.lower()
    title = request.user.get_role_display()
    if request.user.role == User.Role.STAFF:
        assignment = StaffAssignment.objects.filter(staff=request.user, active=True).select_related("queue").first()
        title = assignment.queue.name if assignment else "Support staff"

    session_data = {
        "authenticated": True,
        "id": request.user.pk,
        "role": role,
        "firstName": request.user.first_name,
        "lastName": request.user.last_name,
        "email": request.user.email,
        "phone": request.user.phone,
        "title": title,
        "logoutUrl": reverse("logout"),
        "csrfToken": get_token(request),
    }
    session_json = json.dumps(session_data).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    prototype_path = settings.BASE_DIR / "web" / "ui-prototype" / "index.html"
    document = prototype_path.read_text(encoding="utf-8")
    document = document.replace("<!-- DJANGO:BASE -->", f'<base href="{settings.STATIC_URL}">')
    document = document.replace("<!-- DJANGO:SESSION -->", f"<script>window.ticketServerSession = {session_json};</script>")
    return HttpResponse(document, content_type="text/html")


@login_required
@require_http_methods(["GET", "POST"])
def profile(request):
    if request.method == "GET":
        return render(request, "accounts/profile.html")
    try:
        payload = json.loads(request.body or "{}")
        first_name = str(payload.get("first_name", request.user.first_name)).strip()
        last_name = str(payload.get("last_name", request.user.last_name)).strip()
        phone = str(payload.get("phone", request.user.phone)).strip()
        if not first_name:
            raise ValidationError("First name is required.")
        request.user.first_name = first_name
        request.user.last_name = last_name
        request.user.phone = phone
        # Email is deliberately not read from the payload: it is fixed per account.
        request.user.save()
        AuditEvent.objects.create(actor=request.user, category=AuditEvent.Category.ACCESS, action="Updated profile", object_type="User", object_id=str(request.user.pk), detail={})
        return JsonResponse({"first_name": first_name, "last_name": last_name, "phone": phone, "email": request.user.email})
    except Exception as exc:
        status = 400 if isinstance(exc, ValidationError) else 422
        return JsonResponse({"detail": str(exc)}, status=status)


@login_required
@require_POST
def change_password(request):
    form = PasswordChangeForm(request.user, data=request.POST or json.loads(request.body or "{}"))
    if not form.is_valid():
        return JsonResponse({"errors": form.errors}, status=400)
    user = form.save()
    update_session_auth_hash(request, user)
    AuditEvent.objects.create(actor=user, category=AuditEvent.Category.ACCESS, action="Changed password", object_type="User", object_id=str(user.pk), detail={})
    return JsonResponse({"changed": True})


@login_required
@require_GET
def admin_queue_staff(request):
    if request.user.role != User.Role.ADMIN:
        return JsonResponse({"detail": "Administrator access required."}, status=403)
    queue_id = request.GET.get("queue_id")
    period = request.GET.get("period", "month")
    queue = Queue.objects.filter(pk=queue_id).first() if queue_id else None
    directory = StaffDirectory()
    from web.reporting.queries import period_bounds
    from web.tickets.sla import sla_snapshot

    start, end = period_bounds(period)
    queues = []
    for row in Queue.objects.filter(is_active=True):
        tickets = row.tickets.exclude(status="CLOSED")
        resolved = row.tickets.filter(
            status__in={"RESOLVED", "CLOSED"}, resolved_at__gte=start, resolved_at__lt=end
        )
        period_received = row.tickets.filter(submitted_at__gte=start, submitted_at__lt=end)
        resolved_rows = list(resolved)
        met = sum(1 for ticket in resolved_rows if sla_snapshot(ticket)["overall_met"])
        period_sla_breaches = sum(1 for ticket in resolved_rows if not sla_snapshot(ticket)["overall_met"])
        queues.append({
            "id": row.pk,
            "name": row.name,
            "backlog": tickets.count(),
            "unassigned": tickets.filter(assigned_to__isnull=True).count(),
            "high_priority": tickets.filter(priority="high").count(),
            "staff_count": row.staff_assignments.filter(active=True).count(),
            "period_resolved": len(resolved_rows),
            "period_received": period_received.count(),
            "period_sla_breaches": period_sla_breaches,
            "period_sla_met_percent": round(met / len(resolved_rows) * 100, 2) if resolved_rows else None,
        })
    # The directory is filtered for the lower staff section, but assignment
    # controls in ticket dialogs need an independent, unfiltered source.  A
    # queue filter must never hide a valid assignee from another queue when an
    # administrator is routing a ticket there.
    all_staff = directory.list()
    directory_staff = [
        person for person in all_staff
        if queue is None or person.get("queue") == queue.name
    ]
    return JsonResponse({
        "selected_queue": queue.name if queue else "All queues",
        "period": period,
        "queues": queues,
        "staff": directory_staff,
        "assignment_staff": all_staff,
        "all_staff_count": len(all_staff),
    })


def _admin_payload(request) -> dict[str, object]:
    try:
        return json.loads(request.body or "{}")
    except json.JSONDecodeError as exc:
        raise ValidationError("Request body must be valid JSON.") from exc


@login_required
@require_POST
def admin_create_staff(request):
    try:
        if request.user.role != User.Role.ADMIN:
            raise PermissionDenied("Administrator access required.")
        payload = _admin_payload(request)
        queue = Queue.objects.get(pk=payload.get("queue_id"))
        person = StaffDirectory().create(
            request.user,
            email=str(payload.get("email", "")),
            first_name=str(payload.get("first_name", "")),
            last_name=str(payload.get("last_name", "")),
            password=str(payload.get("password", "")),
            phone=str(payload.get("phone", "")),
            queue=queue,
        )
        return JsonResponse({"id": person.pk, "email": person.email, "name": person.get_full_name(), "queue": queue.name}, status=201)
    except Exception as exc:
        return JsonResponse({"detail": str(exc)}, status=403 if isinstance(exc, PermissionDenied) else 400)


@login_required
@require_POST
def admin_update_staff(request, user_id: int):
    try:
        if request.user.role != User.Role.ADMIN:
            raise PermissionDenied("Administrator access required.")
        payload = _admin_payload(request)
        person = User.objects.get(pk=user_id, role=User.Role.STAFF)
        queue = Queue.objects.get(pk=payload.get("queue_id"))
        updated = StaffDirectory().update(
            request.user,
            person,
            first_name=str(payload.get("first_name", person.first_name)),
            last_name=str(payload.get("last_name", person.last_name)),
            phone=str(payload.get("phone", person.phone)),
            queue=queue,
        )
        return JsonResponse({"id": updated.pk, "email": updated.email, "name": updated.get_full_name(), "queue": queue.name})
    except Exception as exc:
        return JsonResponse({"detail": str(exc)}, status=403 if isinstance(exc, PermissionDenied) else 400)


@login_required
@require_POST
def admin_deactivate_staff(request, user_id: int):
    try:
        person = User.objects.get(pk=user_id, role=User.Role.STAFF)
        StaffDirectory().deactivate(request.user, person)
        return JsonResponse({"deactivated": True})
    except Exception as exc:
        return JsonResponse({"detail": str(exc)}, status=403 if isinstance(exc, PermissionDenied) else 400)


@login_required
@require_GET
def admin_staff_summary(request, user_id: int):
    try:
        person = User.objects.get(pk=user_id, role=User.Role.STAFF)
        result = StaffDirectory().detail(request.user, person, period=request.GET.get("period", "month"))
        return JsonResponse(result)
    except Exception as exc:
        return JsonResponse({"detail": str(exc)}, status=403 if isinstance(exc, PermissionDenied) else 400)
