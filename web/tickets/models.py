"""Persistent ticket, queue, assignment, and prediction records."""

from __future__ import annotations

from django.conf import settings
from django.db import models
from django.db.models import Q


class Queue(models.Model):
    name = models.CharField(max_length=120, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("name",)

    def __str__(self) -> str:
        return self.name


class StaffAssignment(models.Model):
    """Current and historical staff-to-queue assignment records."""

    staff = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="queue_assignments",
        limit_choices_to={"role": "STAFF"},
    )
    queue = models.ForeignKey(Queue, on_delete=models.PROTECT, related_name="staff_assignments")
    active = models.BooleanField(default=True)
    assigned_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-active", "staff__first_name", "staff__last_name")
        constraints = [
            models.UniqueConstraint(
                fields=("staff",),
                condition=Q(active=True),
                name="one_active_queue_per_staff",
            )
        ]

    def __str__(self) -> str:
        return f"{self.staff} → {self.queue}"


class Ticket(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        OPEN = "OPEN", "Open"
        WAITING_FOR_SUPPORT = "WAITING_FOR_SUPPORT", "Waiting for Support"
        WAITING_FOR_CUSTOMER = "WAITING_FOR_CUSTOMER", "Waiting for Customer"
        RESOLVED = "RESOLVED", "Resolved"
        REOPENED = "REOPENED", "Reopened"
        CLOSED = "CLOSED", "Closed"

    class IssueType(models.TextChoices):
        INCIDENT = "Incident", "Incident"
        REQUEST = "Request", "Request"
        PROBLEM = "Problem", "Problem"
        CHANGE = "Change", "Change"

    class Priority(models.TextChoices):
        HIGH = "high", "High"
        MEDIUM = "medium", "Medium"
        LOW = "low", "Low"

    class ResolutionSource(models.TextChoices):
        CUSTOMER = "CUSTOMER", "Customer marked resolved"
        AUTOMATIC_NO_REPLY = "AUTOMATIC_NO_CUSTOMER_REPLY", "Automatic no-reply resolution"
        ADMIN_FORCE_CLOSE = "ADMIN_FORCE_CLOSE", "Administrator force close"
        SYSTEM = "SYSTEM", "System closure"

    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="customer_tickets",
        limit_choices_to={"role": "CUSTOMER"},
    )
    subject = models.CharField(max_length=240, blank=True)
    description = models.TextField(blank=True)
    issue_type = models.CharField(max_length=24, choices=IssueType.choices, blank=True)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.DRAFT)
    client_request_key = models.CharField(max_length=64, blank=True, default="")

    queue = models.ForeignKey(Queue, null=True, blank=True, on_delete=models.PROTECT, related_name="tickets")
    priority = models.CharField(max_length=16, choices=Priority.choices, blank=True)
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="assigned_tickets",
        limit_choices_to={"role": "STAFF"},
    )
    routing_failed = models.BooleanField(default=False)
    routing_failure_reason = models.TextField(blank=True)

    model_family = models.CharField(max_length=24, blank=True)
    model_version = models.CharField(max_length=120, blank=True)
    predicted_queue = models.CharField(max_length=120, blank=True)
    predicted_priority = models.CharField(max_length=16, blank=True)
    queue_confidence_percent = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    priority_confidence_percent = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    confidence_method = models.CharField(max_length=80, blank=True)

    submitted_at = models.DateTimeField(null=True, blank=True)
    first_staff_reply_at = models.DateTimeField(null=True, blank=True)
    last_customer_reply_at = models.DateTimeField(null=True, blank=True)
    waiting_for_customer_since = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    customer_review_until = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    resolution_source = models.CharField(max_length=40, choices=ResolutionSource.choices, blank=True)
    force_close_reason = models.TextField(blank=True)
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="force_closed_tickets",
        limit_choices_to={"role": "ADMIN"},
    )

    first_reply_due_at = models.DateTimeField(null=True, blank=True)
    resolution_due_at = models.DateTimeField(null=True, blank=True)
    resolution_clock_started_at = models.DateTimeField(null=True, blank=True)
    resolution_elapsed_seconds = models.PositiveBigIntegerField(default=0)
    first_reply_sla_met = models.BooleanField(null=True, blank=True)
    resolution_sla_met = models.BooleanField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-updated_at", "-id")
        constraints = [
            models.UniqueConstraint(
                fields=("customer", "client_request_key"),
                condition=Q(client_request_key__gt=""),
                name="unique_customer_client_request_key",
            ),
        ]
        indexes = [
            models.Index(fields=("customer", "client_request_key")),
            models.Index(fields=("status", "queue")),
            models.Index(fields=("status", "assigned_to")),
            models.Index(fields=("customer", "status")),
            models.Index(fields=("routing_failed", "status")),
            models.Index(fields=("first_reply_due_at", "resolution_due_at")),
        ]

    def __str__(self) -> str:
        return f"{self.reference}: {self.subject or '(draft)'}"

    @property
    def reference(self) -> str:
        return f"TKT-{self.pk:06d}" if self.pk else "TKT-unsaved"

    @property
    def is_active_backlog(self) -> bool:
        return self.status in {
            self.Status.OPEN,
            self.Status.WAITING_FOR_SUPPORT,
            self.Status.WAITING_FOR_CUSTOMER,
            self.Status.RESOLVED,
            self.Status.REOPENED,
        }

    @property
    def admin_status_label(self) -> str:
        if self.status in {self.Status.WAITING_FOR_SUPPORT, self.Status.WAITING_FOR_CUSTOMER}:
            return "In progress"
        return self.get_status_display()


class TicketMessage(models.Model):
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="messages")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="ticket_messages",
    )
    body = models.TextField()
    is_system = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at", "id")

    def __str__(self) -> str:
        return f"{self.ticket.reference} message {self.pk}"


class PredictionRecord(models.Model):
    """Immutable prediction evidence retained even after manual corrections."""

    class ModelFamily(models.TextChoices):
        JOINT = "joint", "Joint"
        SEPARATE = "separate", "Separate"

    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="predictions")
    model_family = models.CharField(max_length=24, choices=ModelFamily.choices)
    model_version = models.CharField(max_length=120)
    predicted_queue = models.CharField(max_length=120, blank=True)
    predicted_priority = models.CharField(max_length=16, blank=True)
    queue_confidence_percent = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    priority_confidence_percent = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    confidence_method = models.CharField(max_length=80, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at", "-id")

    def __str__(self) -> str:
        return f"{self.ticket.reference} {self.model_family} prediction"


class RerouteRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        RESOLVED = "RESOLVED", "Resolved"

    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="reroute_requests")
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="reroute_requests",
    )
    reason = models.TextField()
    previous_queue = models.CharField(max_length=120, blank=True)
    previous_assignee = models.CharField(max_length=160, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="resolved_reroute_requests",
        limit_choices_to={"role": "ADMIN"},
    )
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at", "-id")
