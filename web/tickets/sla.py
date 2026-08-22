"""SLA targets and the resolution-clock calculations used by the workflow."""

from __future__ import annotations

from datetime import datetime, timedelta

from django.utils import timezone

from .models import Ticket

SLA_TARGETS: dict[str, dict[str, int]] = {
    Ticket.Priority.HIGH: {"first_reply_hours": 1, "resolution_hours": 4},
    Ticket.Priority.MEDIUM: {"first_reply_hours": 4, "resolution_hours": 8},
    Ticket.Priority.LOW: {"first_reply_hours": 8, "resolution_hours": 16},
}


def targets_for(priority: str) -> dict[str, int]:
    return SLA_TARGETS.get(str(priority).lower(), SLA_TARGETS[Ticket.Priority.MEDIUM])


def initialise_clocks(ticket: Ticket, now: datetime) -> None:
    targets = targets_for(ticket.priority)
    ticket.first_reply_due_at = now + timedelta(hours=targets["first_reply_hours"])
    ticket.resolution_due_at = now + timedelta(hours=targets["resolution_hours"])
    ticket.resolution_clock_started_at = now
    ticket.resolution_elapsed_seconds = 0
    ticket.first_reply_sla_met = None
    ticket.resolution_sla_met = None


def pause_resolution_clock(ticket: Ticket, now: datetime) -> None:
    if ticket.resolution_clock_started_at is None:
        return
    elapsed = max(0, int((now - ticket.resolution_clock_started_at).total_seconds()))
    ticket.resolution_elapsed_seconds += elapsed
    ticket.resolution_clock_started_at = None


def resume_resolution_clock(ticket: Ticket, now: datetime) -> None:
    if ticket.resolution_clock_started_at is None:
        ticket.resolution_clock_started_at = now


def active_resolution_seconds(ticket: Ticket, now: datetime | None = None) -> int:
    now = now or timezone.now()
    elapsed = int(ticket.resolution_elapsed_seconds)
    if ticket.resolution_clock_started_at is not None:
        elapsed += max(0, int((now - ticket.resolution_clock_started_at).total_seconds()))
    return elapsed


def sla_snapshot(ticket: Ticket, now: datetime | None = None) -> dict[str, object]:
    now = now or timezone.now()
    targets = targets_for(ticket.priority)
    first_reply_breached = bool(
        ticket.first_staff_reply_at is None
        and ticket.first_reply_due_at is not None
        and now > ticket.first_reply_due_at
        and ticket.status != Ticket.Status.DRAFT
    )
    resolution_breached = bool(
        ticket.resolution_due_at is not None
        and active_resolution_seconds(ticket, now) > targets["resolution_hours"] * 3600
        and ticket.status != Ticket.Status.DRAFT
        and ticket.status != Ticket.Status.CLOSED
    )
    first_reply_met = ticket.first_reply_sla_met
    if first_reply_met is None and ticket.first_staff_reply_at and ticket.first_reply_due_at:
        first_reply_met = ticket.first_staff_reply_at <= ticket.first_reply_due_at
    resolution_met = ticket.resolution_sla_met
    if resolution_met is None and ticket.resolved_at:
        resolution_met = active_resolution_seconds(ticket, ticket.resolved_at) <= targets["resolution_hours"] * 3600
    return {
        "first_reply_target_hours": targets["first_reply_hours"],
        "resolution_target_hours": targets["resolution_hours"],
        "first_reply_breached": first_reply_breached,
        "resolution_breached": resolution_breached,
        "first_reply_met": first_reply_met,
        "resolution_met": resolution_met,
        "overall_met": first_reply_met is True and resolution_met is True,
        "active_resolution_seconds": active_resolution_seconds(ticket, now),
    }
