"""Administration seam for staff accounts, queue assignment, and summaries."""

from __future__ import annotations

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.utils import timezone

from web.audit.models import AuditEvent
from web.tickets.models import Queue, StaffAssignment, Ticket
from web.tickets.sla import sla_snapshot

from .models import User


class StaffDirectory:
    def list(self, *, queue: Queue | None = None) -> list[dict[str, object]]:
        staff = User.objects.filter(role=User.Role.STAFF, is_active=True).prefetch_related("queue_assignments__queue")
        result = []
        for person in staff:
            assignment = next((row for row in person.queue_assignments.all() if row.active), None)
            if queue and (assignment is None or assignment.queue_id != queue.pk):
                continue
            assigned = Ticket.objects.filter(assigned_to=person, status__in={Ticket.Status.WAITING_FOR_SUPPORT, Ticket.Status.WAITING_FOR_CUSTOMER, Ticket.Status.REOPENED})
            result.append({
                "id": person.pk,
                "first_name": person.first_name,
                "last_name": person.last_name,
                "name": person.get_full_name(),
                "email": person.email,
                "phone": person.phone,
                "role": person.role,
                "queue": assignment.queue.name if assignment else "",
                "active_tickets": assigned.count(),
                "waiting_for_reply": assigned.filter(status=Ticket.Status.WAITING_FOR_SUPPORT).count(),
                "resolved": Ticket.objects.filter(assigned_to=person, status__in={Ticket.Status.RESOLVED, Ticket.Status.CLOSED}).count(),
            })
        return result

    def create(self, actor: User, *, email: str, first_name: str, last_name: str, password: str, queue: Queue, phone: str = "") -> User:
        self._require_admin(actor)
        if not email.strip() or not first_name.strip() or not password:
            raise ValidationError("Email, first name, and password are required.")
        validate_password(password)
        with transaction.atomic():
            person = User.objects.create_user(email=email, password=password, first_name=first_name.strip(), last_name=last_name.strip(), phone=phone.strip(), role=User.Role.STAFF)
            StaffAssignment.objects.create(staff=person, queue=queue)
            AuditEvent.objects.create(actor=actor, category=AuditEvent.Category.ACCESS, action="Created staff account", object_type="User", object_id=str(person.pk), detail={"queue": queue.name, "email": person.email})
            return person

    def update(self, actor: User, person: User, *, first_name: str, last_name: str, phone: str, queue: Queue) -> User:
        self._require_admin(actor)
        if person.role != User.Role.STAFF or not person.is_active:
            raise ValidationError("Only active staff accounts can be updated.")
        with transaction.atomic():
            person.first_name = first_name.strip()
            person.last_name = last_name.strip()
            person.phone = phone.strip()
            person.save()
            current = StaffAssignment.objects.filter(staff=person, active=True).first()
            if current is None or current.queue_id != queue.pk:
                if current:
                    current.active = False
                    current.ended_at = timezone.now()
                    current.save()
                StaffAssignment.objects.create(staff=person, queue=queue)
            AuditEvent.objects.create(actor=actor, category=AuditEvent.Category.ACCESS, action="Updated staff account", object_type="User", object_id=str(person.pk), detail={"queue": queue.name})
            return person

    def deactivate(self, actor: User, person: User) -> None:
        self._require_admin(actor)
        if person.role != User.Role.STAFF:
            raise ValidationError("Only staff accounts can be deactivated.")
        with transaction.atomic():
            person.is_active = False
            person.save(update_fields=["is_active", "updated_at"])
            StaffAssignment.objects.filter(staff=person, active=True).update(active=False, ended_at=timezone.now())
            AuditEvent.objects.create(actor=actor, category=AuditEvent.Category.ACCESS, action="Deactivated staff account", object_type="User", object_id=str(person.pk), detail={})

    def detail(self, actor: User, person: User, *, period: str = "month") -> dict[str, object]:
        self._require_admin(actor)
        from web.reporting.queries import period_bounds

        start, end = period_bounds(period)
        assignment = StaffAssignment.objects.filter(staff=person, active=True).select_related("queue").first()
        resolved = Ticket.objects.filter(
            assigned_to=person,
            status__in={Ticket.Status.RESOLVED, Ticket.Status.CLOSED},
            resolved_at__gte=start,
            resolved_at__lt=end,
        )
        active = Ticket.objects.filter(
            assigned_to=person,
            status__in={Ticket.Status.WAITING_FOR_SUPPORT, Ticket.Status.WAITING_FOR_CUSTOMER, Ticket.Status.REOPENED},
        )
        by_priority = {}
        for priority in Ticket.Priority.values:
            rows = list(resolved.filter(priority=priority))
            met = sum(1 for row in rows if sla_snapshot(row)["overall_met"])
            by_priority[priority] = {
                "resolved": len(rows),
                "sla_met_percent": round(met / len(rows) * 100, 2) if rows else None,
            }
        resolved_rows = list(resolved)
        met = sum(1 for row in resolved_rows if sla_snapshot(row)["overall_met"])
        return {
            "id": person.pk,
            "name": person.get_full_name(),
            "email": person.email,
            "phone": person.phone,
            "role": person.role,
            "active": person.is_active,
            "queue": assignment.queue.name if assignment else "",
            "period": period,
            "resolved_count": len(resolved_rows),
            "overall_sla_met_percent": round(met / len(resolved_rows) * 100, 2) if resolved_rows else None,
            "sla_by_priority": by_priority,
            "active_tickets": active.count(),
            "waiting_for_reply": active.filter(status=Ticket.Status.WAITING_FOR_SUPPORT).count(),
        }

    @staticmethod
    def _require_admin(actor: User) -> None:
        if not actor.is_authenticated or actor.role != User.Role.ADMIN:
            raise PermissionDenied("Administrator access required.")
