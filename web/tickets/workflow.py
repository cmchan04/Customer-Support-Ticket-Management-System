"""Deep ticket workflow interface: permissions, transitions, SLA clocks, and audit."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.utils import timezone

from web.accounts.models import User
from web.audit.models import AuditEvent

from .models import PredictionRecord, Queue, RerouteRequest, StaffAssignment, Ticket, TicketMessage
from .sla import (
    initialise_clocks,
    pause_resolution_clock,
    resume_resolution_clock,
    sla_snapshot,
    targets_for,
)


class TicketWorkflow:
    """Small public interface with all ticket state changes behind it.

    Methods accept authenticated domain users and return the saved Ticket. They
    are atomic, append an AuditEvent, and raise ``PermissionDenied`` or
    ``ValidationError`` before making a partial transition.
    """

    def __init__(self, prediction_service: Any | None = None, clock=timezone.now) -> None:
        self.prediction_service = prediction_service
        self.clock = clock

    @staticmethod
    def _require_authenticated(actor: User) -> None:
        if not actor or not actor.is_authenticated:
            raise PermissionDenied("Authentication is required.")

    @staticmethod
    def _require_role(actor: User, *roles: str) -> None:
        TicketWorkflow._require_authenticated(actor)
        if actor.role not in roles:
            raise PermissionDenied("This action is not available for your role.")

    @staticmethod
    def _require_nonempty(value: str, label: str) -> str:
        clean = (value or "").strip()
        if not clean:
            raise ValidationError(f"{label} must not be empty.")
        return clean

    @staticmethod
    def _audit(actor: User | None, category: str, action: str, ticket: Ticket, **detail: object) -> None:
        AuditEvent.objects.create(
            actor=actor,
            category=category,
            action=action,
            object_type="Ticket",
            object_id=str(ticket.pk),
            detail={"reference": ticket.reference, **detail},
        )

    def create_draft(
        self,
        customer: User,
        *,
        subject: str = "",
        description: str = "",
        issue_type: str = "",
        request_key: str | None = None,
    ) -> Ticket:
        self._require_role(customer, User.Role.CUSTOMER)
        clean_key = (request_key or "").strip()[:64]
        values = {
            "subject": (subject or "").strip(),
            "description": (description or "").strip(),
            "issue_type": (issue_type or "").strip(),
            "status": Ticket.Status.DRAFT,
        }
        if not clean_key:
            return Ticket.objects.create(customer=customer, **values)

        ticket, created = Ticket.objects.get_or_create(
            customer=customer,
            client_request_key=clean_key,
            defaults=values,
        )
        if not created and ticket.status == Ticket.Status.DRAFT:
            for field, value in values.items():
                setattr(ticket, field, value)
            ticket.save(update_fields=[*values, "updated_at"])
        return ticket

    def submit(
        self,
        ticket: Ticket,
        actor: User,
        *,
        model_family: str | None = None,
        request_key: str | None = None,
    ) -> Ticket:
        self._require_role(actor, User.Role.CUSTOMER)
        with transaction.atomic():
            current = Ticket.objects.select_for_update().get(pk=ticket.pk)
            if current.customer_id != actor.pk:
                raise PermissionDenied("Customers can submit only their own tickets.")
            if current.status != Ticket.Status.DRAFT:
                if request_key and current.client_request_key == request_key[:64]:
                    return current
                raise ValidationError("Only a draft can be submitted.")
            if request_key and not current.client_request_key:
                current.client_request_key = request_key[:64]
            self._require_nonempty(current.subject, "Subject")
            self._require_nonempty(current.description, "Description")
            if current.issue_type not in Ticket.IssueType.values:
                raise ValidationError("A valid issue type is required.")

            now = self.clock()
            # The active deployment is server-owned. Keep ``model_family`` in
            # the signature for backwards compatibility with internal callers,
            # but never trust a client-provided family for a new submission.
            family = self._default_model_family()
            current.status = Ticket.Status.OPEN
            current.submitted_at = now
            current.model_family = family
            current.model_version = getattr(self.prediction_service, "model_version", "local-artifact")
            initialise_clocks(current, now)
            prediction = self._predict(current, family)
            if prediction is None:
                current.routing_failed = True
                current.routing_failure_reason = "Prediction unavailable; manual routing required."
                current.confidence_method = "unavailable"
            else:
                current.model_version = getattr(prediction, "model_version", "") or current.model_version
                current.routing_failed = False
                current.routing_failure_reason = ""
                current.predicted_queue = prediction.queue
                current.predicted_priority = str(prediction.priority).lower()
                current.priority = current.predicted_priority
                current.queue_confidence_percent = prediction.queue_confidence_percent
                current.priority_confidence_percent = prediction.priority_confidence_percent
                confidence_method = getattr(
                    prediction,
                    "confidence_method",
                    getattr(prediction, "queue_confidence_method", "unavailable"),
                )
                current.confidence_method = confidence_method
                current.queue = Queue.objects.filter(name=prediction.queue).first()
                if current.queue is None and prediction.queue:
                    current.queue = Queue.objects.create(name=prediction.queue)
                if current.predicted_priority not in Ticket.Priority.values:
                    current.routing_failed = True
                    current.routing_failure_reason = "Priority prediction was not recognised."
                PredictionRecord.objects.create(
                    ticket=current,
                    model_family=family,
                    model_version=current.model_version,
                    predicted_queue=prediction.queue,
                    predicted_priority=current.predicted_priority,
                    queue_confidence_percent=prediction.queue_confidence_percent,
                    priority_confidence_percent=prediction.priority_confidence_percent,
                    confidence_method=confidence_method,
                )
            current.save()
            TicketMessage.objects.create(
                ticket=current,
                author=actor,
                body=current.description,
            )
            self._audit(actor, AuditEvent.Category.TICKET, "Submitted ticket", current, model_family=family, routing_failed=current.routing_failed)
            return current

    def claim(self, ticket: Ticket, staff: User) -> Ticket:
        self._require_role(staff, User.Role.STAFF)
        with transaction.atomic():
            current = Ticket.objects.select_for_update().select_related("queue").get(pk=ticket.pk)
            assignment = StaffAssignment.objects.filter(staff=staff, active=True).select_related("queue").first()
            if assignment is None or current.queue_id != assignment.queue_id:
                raise PermissionDenied("You can claim tickets only from your active queue.")
            if current.status != Ticket.Status.OPEN or current.assigned_to_id is not None or current.routing_failed or RerouteRequest.objects.filter(ticket=current, status=RerouteRequest.Status.PENDING).exists():
                raise ValidationError("This ticket is no longer available in the ticket pool.")
            current.assigned_to = staff
            current.status = Ticket.Status.WAITING_FOR_SUPPORT
            current.routing_failed = False
            current.save()
            self._audit(staff, AuditEvent.Category.TICKET, "Claimed ticket", current, queue=assignment.queue.name)
            return current

    def reply(self, ticket: Ticket, actor: User, body: str) -> Ticket:
        self._require_nonempty(body, "Reply")
        self._require_role(actor, User.Role.CUSTOMER, User.Role.STAFF)
        with transaction.atomic():
            current = Ticket.objects.select_for_update().get(pk=ticket.pk)
            now = self.clock()
            if actor.role == User.Role.STAFF:
                if current.assigned_to_id != actor.pk or current.status not in {Ticket.Status.WAITING_FOR_SUPPORT, Ticket.Status.REOPENED}:
                    raise PermissionDenied("This ticket is not awaiting your staff reply.")
                if current.first_staff_reply_at is None:
                    current.first_staff_reply_at = now
                    current.first_reply_sla_met = bool(current.first_reply_due_at and now <= current.first_reply_due_at)
                pause_resolution_clock(current, now)
                current.waiting_for_customer_since = now
                current.status = Ticket.Status.WAITING_FOR_CUSTOMER
                action = "Staff replied to customer"
            else:
                if current.customer_id != actor.pk or current.status not in {
                    Ticket.Status.OPEN,
                    Ticket.Status.WAITING_FOR_SUPPORT,
                    Ticket.Status.WAITING_FOR_CUSTOMER,
                    Ticket.Status.REOPENED,
                }:
                    raise PermissionDenied("This ticket is not available for a customer reply.")
                current.last_customer_reply_at = now
                current.waiting_for_customer_since = None
                if current.status == Ticket.Status.WAITING_FOR_CUSTOMER:
                    resume_resolution_clock(current, now)
                    current.status = Ticket.Status.WAITING_FOR_SUPPORT
                elif current.status == Ticket.Status.OPEN and current.assigned_to_id is not None:
                    current.status = Ticket.Status.WAITING_FOR_SUPPORT
                action = "Customer replied to ticket"
            TicketMessage.objects.create(ticket=current, author=actor, body=body.strip())
            current.save()
            self._audit(actor, AuditEvent.Category.TICKET, action, current)
            return current

    def mark_customer_resolved(self, ticket: Ticket, customer: User) -> Ticket:
        self._require_role(customer, User.Role.CUSTOMER)
        with transaction.atomic():
            current = Ticket.objects.select_for_update().get(pk=ticket.pk)
            if current.customer_id != customer.pk or not current.is_active_backlog or current.status == Ticket.Status.RESOLVED:
                raise PermissionDenied("You can resolve only your own active ticket.")
            now = self.clock()
            pause_resolution_clock(current, now)
            current.status = Ticket.Status.RESOLVED
            current.resolved_at = now
            current.customer_review_until = now + timedelta(days=3)
            current.resolution_source = Ticket.ResolutionSource.CUSTOMER
            current.resolution_sla_met = bool(sla_snapshot(current, now)["active_resolution_seconds"] <= targets_for(current.priority)["resolution_hours"] * 3600)
            current.waiting_for_customer_since = None
            current.save()
            self._audit(customer, AuditEvent.Category.TICKET, "Customer marked ticket resolved", current)
            return current

    def reopen(self, ticket: Ticket, customer: User) -> Ticket:
        self._require_role(customer, User.Role.CUSTOMER)
        with transaction.atomic():
            current = Ticket.objects.select_for_update().get(pk=ticket.pk)
            now = self.clock()
            if current.customer_id != customer.pk or current.status != Ticket.Status.RESOLVED or not current.customer_review_until or now > current.customer_review_until:
                raise ValidationError("Only a recently resolved ticket can be reopened.")
            current.status = Ticket.Status.REOPENED
            current.resolved_at = None
            current.customer_review_until = None
            current.resolution_source = ""
            resume_resolution_clock(current, now)
            current.save()
            self._audit(customer, AuditEvent.Category.TICKET, "Customer reopened ticket", current)
            return current

    def request_reroute(self, ticket: Ticket, staff: User, reason: str) -> Ticket:
        self._require_role(staff, User.Role.STAFF)
        clean_reason = self._require_nonempty(reason, "Reroute reason")
        with transaction.atomic():
            current = Ticket.objects.select_for_update().select_related("queue", "assigned_to").get(pk=ticket.pk)
            if current.assigned_to_id != staff.pk or current.status == Ticket.Status.CLOSED:
                raise PermissionDenied("Only the assigned staff member can request rerouting.")
            RerouteRequest.objects.create(
                ticket=current,
                requested_by=staff,
                reason=clean_reason,
                previous_queue=current.queue.name if current.queue else "",
                previous_assignee=staff.get_full_name(),
            )
            current.assigned_to = None
            current.status = Ticket.Status.OPEN
            current.routing_failed = True
            current.routing_failure_reason = clean_reason
            current.save()
            self._audit(staff, AuditEvent.Category.ROUTING, "Staff requested reroute", current, reason=clean_reason)
            return current

    def admin_route(
        self,
        ticket: Ticket,
        admin: User,
        *,
        queue: Queue | None = None,
        assignee: User | None = None,
        priority: str | None = None,
    ) -> Ticket:
        self._require_role(admin, User.Role.ADMIN)
        with transaction.atomic():
            current = Ticket.objects.select_for_update().select_related("queue", "assigned_to").get(pk=ticket.pk)
            if current.status == Ticket.Status.CLOSED:
                raise ValidationError("Closed tickets cannot be routed.")
            if assignee and (assignee.role != User.Role.STAFF or not queue or not StaffAssignment.objects.filter(staff=assignee, queue=queue, active=True).exists()):
                raise ValidationError("The assignee must be active in the selected queue.")
            previous = {"queue": current.queue.name if current.queue else "", "assignee": current.assigned_to.get_full_name() if current.assigned_to else ""}
            if queue is not None:
                current.queue = queue
            if assignee is not None:
                current.assigned_to = assignee
                if current.status == Ticket.Status.OPEN:
                    current.status = Ticket.Status.WAITING_FOR_SUPPORT
            if priority is not None:
                if priority not in Ticket.Priority.values:
                    raise ValidationError("Invalid priority.")
                current.priority = priority
                if current.submitted_at:
                    targets = targets_for(priority)
                    current.first_reply_due_at = current.submitted_at + timedelta(hours=targets["first_reply_hours"])
                    current.resolution_due_at = current.submitted_at + timedelta(hours=targets["resolution_hours"])
            current.routing_failed = False
            current.routing_failure_reason = ""
            current.save()
            RerouteRequest.objects.filter(ticket=current, status=RerouteRequest.Status.PENDING).update(
                status=RerouteRequest.Status.RESOLVED,
                resolved_by=admin,
                resolved_at=self.clock(),
            )
            self._audit(admin, AuditEvent.Category.ROUTING, "Admin updated ticket routing", current, previous=previous, priority=current.priority)
            return current

    def force_close(self, ticket: Ticket, admin: User, reason: str) -> Ticket:
        self._require_role(admin, User.Role.ADMIN)
        clean_reason = self._require_nonempty(reason, "Force-close reason")
        with transaction.atomic():
            current = Ticket.objects.select_for_update().get(pk=ticket.pk)
            if current.status == Ticket.Status.CLOSED:
                raise ValidationError("Ticket is already closed.")
            now = self.clock()
            pause_resolution_clock(current, now)
            current.status = Ticket.Status.CLOSED
            current.closed_at = now
            current.resolved_at = current.resolved_at or now
            current.customer_review_until = None
            current.resolution_source = Ticket.ResolutionSource.ADMIN_FORCE_CLOSE
            current.force_close_reason = clean_reason
            current.closed_by = admin
            current.save()
            self._audit(admin, AuditEvent.Category.TICKET, "Admin force closed ticket", current, reason=clean_reason)
            return current

    def auto_resolve_due_customer_replies(self) -> int:
        now = self.clock()
        count = 0
        for ticket in Ticket.objects.filter(status=Ticket.Status.WAITING_FOR_CUSTOMER, waiting_for_customer_since__lte=now).iterator():
            with transaction.atomic():
                current = Ticket.objects.select_for_update().get(pk=ticket.pk)
                if current.status != Ticket.Status.WAITING_FOR_CUSTOMER or not current.waiting_for_customer_since or current.waiting_for_customer_since > now:
                    continue
                pause_resolution_clock(current, now)
                current.status = Ticket.Status.RESOLVED
                current.resolved_at = now
                current.customer_review_until = now + timedelta(days=3)
                current.resolution_source = Ticket.ResolutionSource.AUTOMATIC_NO_REPLY
                current.resolution_sla_met = bool(sla_snapshot(current, now)["active_resolution_seconds"] <= targets_for(current.priority)["resolution_hours"] * 3600)
                current.waiting_for_customer_since = None
                current.save()
                self._audit(None, AuditEvent.Category.SYSTEM, "Automatically resolved after no customer reply", current)
                count += 1
        return count

    def close_due_resolved_tickets(self) -> int:
        now = self.clock()
        count = 0
        for ticket in Ticket.objects.filter(status=Ticket.Status.RESOLVED, customer_review_until__lte=now).iterator():
            with transaction.atomic():
                current = Ticket.objects.select_for_update().get(pk=ticket.pk)
                if current.status != Ticket.Status.RESOLVED or not current.customer_review_until or current.customer_review_until > now:
                    continue
                current.status = Ticket.Status.CLOSED
                current.closed_at = now
                current.resolution_source = Ticket.ResolutionSource.SYSTEM
                current.force_close_reason = "Customer did not reopen the resolved ticket within 3 days."
                current.customer_review_until = None
                current.save()
                self._audit(None, AuditEvent.Category.SYSTEM, "Automatically closed resolved ticket", current, reason=current.force_close_reason)
                count += 1
        return count

    def lifecycle_tick(self) -> dict[str, int]:
        return {
            "auto_resolved": self.auto_resolve_due_customer_replies(),
            "auto_closed": self.close_due_resolved_tickets(),
        }

    def _default_model_family(self) -> str:
        from web.modelops.services import active_model_family

        return active_model_family()

    def _predict(self, ticket: Ticket, family: str):
        service = self.prediction_service
        if service is None:
            from web.modelops.services import PredictionService

            service = PredictionService()
        try:
            return service.predict(ticket.subject, ticket.description, ticket.issue_type, family=family)
        except Exception:
            return None
