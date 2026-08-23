"""Thin HTTP adapter; all transitions live in ``TicketWorkflow``."""

from __future__ import annotations

import json
from functools import wraps

from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied, ValidationError
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from web.accounts.models import User

from .models import Queue, StaffAssignment, Ticket
from .serializers import ticket_detail as serialize_ticket_detail
from .workflow import TicketWorkflow


def _payload(request) -> dict[str, object]:
    try:
        return json.loads(request.body or "{}")
    except json.JSONDecodeError as exc:
        raise ValidationError("Request body must be valid JSON.") from exc


def _request_key(request) -> str:
    """Return a bounded idempotency key supplied by a client retry."""

    return str(request.headers.get("Idempotency-Key", "")).strip()[:64]


def _response_error(exc: Exception):
    if isinstance(exc, PermissionDenied):
        return JsonResponse({"detail": str(exc)}, status=403)
    if isinstance(exc, ValidationError):
        return JsonResponse({"detail": str(exc)}, status=400)
    return JsonResponse({"detail": str(exc)}, status=422)


def role_required(*roles: str):
    def decorator(view):
        @wraps(view)
        @login_required
        def wrapped(request, *args, **kwargs):
            if request.user.role not in roles:
                return JsonResponse({"detail": "Access denied."}, status=403)
            return view(request, *args, **kwargs)

        return wrapped

    return decorator


def _visible_to(user: User, ticket: Ticket) -> bool:
    if user.role == User.Role.ADMIN:
        return True
    if ticket.status == Ticket.Status.CLOSED:
        return False
    if user.role == User.Role.CUSTOMER:
        return ticket.customer_id == user.pk
    if user.role == User.Role.STAFF:
        if ticket.assigned_to_id == user.pk:
            return True
        return ticket.status == Ticket.Status.OPEN and StaffAssignment.objects.filter(staff=user, queue=ticket.queue, active=True).exists()
    return False


@login_required
@require_GET
def ticket_detail(request, ticket_id: int):
    ticket = get_object_or_404(Ticket.objects.select_related("customer", "queue", "assigned_to").prefetch_related("messages__author", "predictions", "reroute_requests__requested_by"), pk=ticket_id)
    if not _visible_to(request.user, ticket):
        return JsonResponse({"detail": "Ticket is not visible to this account."}, status=404)
    return JsonResponse(serialize_ticket_detail(ticket, viewer=request.user))


@role_required(User.Role.CUSTOMER)
@require_POST
def customer_create_draft(request):
    try:
        payload = _payload(request)
        ticket = TicketWorkflow().create_draft(
            request.user,
            subject=str(payload.get("subject", "")),
            description=str(payload.get("description", "")),
            issue_type=str(payload.get("issue_type", "")),
            request_key=_request_key(request),
        )
        return JsonResponse(serialize_ticket_detail(ticket, viewer=request.user), status=201)
    except Exception as exc:
        return _response_error(exc)


@role_required(User.Role.CUSTOMER)
@require_POST
def customer_update_draft(request, ticket_id: int):
    try:
        ticket = get_object_or_404(Ticket, pk=ticket_id, customer=request.user)
        request_key = _request_key(request)
        if ticket.status != Ticket.Status.DRAFT:
            if request_key and ticket.client_request_key == request_key:
                return JsonResponse(serialize_ticket_detail(ticket, viewer=request.user))
            raise ValidationError("Only a draft can be updated.")
        payload = _payload(request)
        ticket.subject = str(payload.get("subject", ticket.subject)).strip()
        ticket.description = str(payload.get("description", ticket.description)).strip()
        ticket.issue_type = str(payload.get("issue_type", ticket.issue_type)).strip()
        ticket.save()
        return JsonResponse(serialize_ticket_detail(ticket, viewer=request.user))
    except Exception as exc:
        return _response_error(exc)


@role_required(User.Role.CUSTOMER)
@require_http_methods(["DELETE"])
def customer_delete_draft(request, ticket_id: int):
    try:
        ticket = get_object_or_404(Ticket, pk=ticket_id, customer=request.user, status=Ticket.Status.DRAFT)
        ticket.delete()
        return JsonResponse({"deleted": True})
    except Exception as exc:
        return _response_error(exc)


@role_required(User.Role.CUSTOMER)
@require_POST
def customer_submit(request, ticket_id: int):
    try:
        ticket = get_object_or_404(Ticket, pk=ticket_id)
        # The active deployment is server-owned. Do not allow a stale client
        # model selector (or a forged request) to label a new ticket with a
        # different model family than the one selected by the administrator.
        _payload(request)
        result = TicketWorkflow().submit(
            ticket,
            request.user,
            request_key=_request_key(request),
        )
        return JsonResponse(serialize_ticket_detail(result, viewer=request.user))
    except Exception as exc:
        return _response_error(exc)


@role_required(User.Role.CUSTOMER)
@require_POST
def customer_reply(request, ticket_id: int):
    try:
        result = TicketWorkflow().reply(get_object_or_404(Ticket, pk=ticket_id), request.user, str(_payload(request).get("body", "")))
        return JsonResponse(serialize_ticket_detail(result, viewer=request.user))
    except Exception as exc:
        return _response_error(exc)


@role_required(User.Role.CUSTOMER)
@require_POST
def customer_resolve(request, ticket_id: int):
    try:
        result = TicketWorkflow().mark_customer_resolved(get_object_or_404(Ticket, pk=ticket_id), request.user)
        return JsonResponse(serialize_ticket_detail(result, viewer=request.user))
    except Exception as exc:
        return _response_error(exc)


@role_required(User.Role.CUSTOMER)
@require_POST
def customer_reopen(request, ticket_id: int):
    try:
        result = TicketWorkflow().reopen(get_object_or_404(Ticket, pk=ticket_id), request.user)
        return JsonResponse(serialize_ticket_detail(result, viewer=request.user))
    except Exception as exc:
        return _response_error(exc)


@role_required(User.Role.STAFF)
@require_POST
def staff_claim(request, ticket_id: int):
    try:
        result = TicketWorkflow().claim(get_object_or_404(Ticket, pk=ticket_id), request.user)
        return JsonResponse(serialize_ticket_detail(result, viewer=request.user))
    except Exception as exc:
        return _response_error(exc)


@role_required(User.Role.STAFF)
@require_POST
def staff_reply(request, ticket_id: int):
    try:
        result = TicketWorkflow().reply(get_object_or_404(Ticket, pk=ticket_id), request.user, str(_payload(request).get("body", "")))
        return JsonResponse(serialize_ticket_detail(result, viewer=request.user))
    except Exception as exc:
        return _response_error(exc)


@role_required(User.Role.STAFF)
@require_POST
def staff_request_reroute(request, ticket_id: int):
    try:
        result = TicketWorkflow().request_reroute(get_object_or_404(Ticket, pk=ticket_id), request.user, str(_payload(request).get("reason", "")))
        return JsonResponse(serialize_ticket_detail(result, viewer=request.user))
    except Exception as exc:
        return _response_error(exc)


@role_required(User.Role.ADMIN)
@require_POST
def admin_route(request, ticket_id: int):
    try:
        payload = _payload(request)
        queue = Queue.objects.filter(pk=payload.get("queue_id")).first() if payload.get("queue_id") else None
        assignee = User.objects.filter(pk=payload.get("assignee_id"), role=User.Role.STAFF).first() if payload.get("assignee_id") else None
        result = TicketWorkflow().admin_route(
            get_object_or_404(Ticket, pk=ticket_id),
            request.user,
            queue=queue,
            assignee=assignee,
            priority=payload.get("priority"),
        )
        return JsonResponse(serialize_ticket_detail(result, viewer=request.user))
    except Exception as exc:
        return _response_error(exc)


@role_required(User.Role.ADMIN)
@require_POST
def admin_force_close(request, ticket_id: int):
    try:
        result = TicketWorkflow().force_close(get_object_or_404(Ticket, pk=ticket_id), request.user, str(_payload(request).get("reason", "")))
        return JsonResponse(serialize_ticket_detail(result, viewer=request.user))
    except Exception as exc:
        return _response_error(exc)
