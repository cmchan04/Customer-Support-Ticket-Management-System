from __future__ import annotations

from datetime import datetime, timedelta

from django.core.exceptions import PermissionDenied, ValidationError
from django.test import TestCase
from django.utils import timezone

from web.accounts.models import User
from web.modelops.models import ModelDeployment
from web.modelops.services import ModelPrediction

from .models import Queue, StaffAssignment, Ticket
from .workflow import TicketWorkflow


class FakePredictionService:
    model_version = "test-model-1"

    def predict(self, subject, body, issue_type, *, family=None):
        return ModelPrediction(
            queue="Technical Support",
            priority="high",
            queue_confidence_percent=84.5,
            priority_confidence_percent=73.25,
            confidence_method="sigmoid_calibrated_probability",
        )


class TicketWorkflowTests(TestCase):
    def setUp(self):
        self.now = timezone.make_aware(datetime(2026, 8, 21, 9, 0))
        self.customer = User.objects.create_user(
            email="maya@gmail.com", password="Password1!", first_name="Maya", last_name="Lim", role=User.Role.CUSTOMER
        )
        self.staff = User.objects.create_user(
            email="arun@outlook.com", password="Password1!", first_name="Arun", last_name="Patel", role=User.Role.STAFF
        )
        self.admin = User.objects.create_user(
            email="aisha@admin.com", password="Password1!", first_name="Aisha", last_name="Tan", role=User.Role.ADMIN
        )
        self.queue = Queue.objects.create(name="Technical Support")
        StaffAssignment.objects.create(staff=self.staff, queue=self.queue)
        self.workflow = TicketWorkflow(prediction_service=FakePredictionService(), clock=lambda: self.now)

    def _draft(self):
        return self.workflow.create_draft(
            self.customer,
            subject="Password reset link expired",
            description="The reset link expired before I could use it.",
            issue_type=Ticket.IssueType.INCIDENT,
        )

    def test_submission_claim_reply_and_customer_resolution_lifecycle(self):
        ticket = self.workflow.submit(self._draft(), self.customer)
        self.assertEqual(ticket.status, Ticket.Status.OPEN)
        self.assertEqual(ticket.queue, self.queue)
        self.assertEqual(ticket.priority, Ticket.Priority.HIGH)
        self.assertEqual(ticket.queue_confidence_percent, 84.5)

        ticket = self.workflow.reply(ticket, self.customer, "The account email is maya@gmail.com.")
        self.assertEqual(ticket.status, Ticket.Status.OPEN)

        ticket = self.workflow.claim(ticket, self.staff)
        self.assertEqual(ticket.status, Ticket.Status.WAITING_FOR_SUPPORT)
        ticket = self.workflow.reply(ticket, self.customer, "I can also reproduce this on another browser.")
        self.assertEqual(ticket.status, Ticket.Status.WAITING_FOR_SUPPORT)
        ticket = self.workflow.reply(ticket, self.staff, "Please request a fresh reset link.")
        self.assertEqual(ticket.status, Ticket.Status.WAITING_FOR_CUSTOMER)
        ticket = self.workflow.reply(ticket, self.customer, "The new link worked.")
        self.assertEqual(ticket.status, Ticket.Status.WAITING_FOR_SUPPORT)
        ticket = self.workflow.mark_customer_resolved(ticket, self.customer)
        self.assertEqual(ticket.status, Ticket.Status.RESOLVED)
        self.assertIsNotNone(ticket.customer_review_until)

        ticket = self.workflow.reopen(ticket, self.customer)
        self.assertEqual(ticket.status, Ticket.Status.REOPENED)

    def test_empty_submission_and_reply_are_rejected(self):
        draft = self.workflow.create_draft(self.customer)
        with self.assertRaises(ValidationError):
            self.workflow.submit(draft, self.customer)

        ticket = self.workflow.submit(self._draft(), self.customer)
        ticket = self.workflow.claim(ticket, self.staff)
        with self.assertRaises(ValidationError):
            self.workflow.reply(ticket, self.staff, "   ")

    def test_customer_request_key_makes_retries_idempotent(self):
        request_key = "browser-retry-123"
        first = self.workflow.create_draft(
            self.customer,
            subject="Payment was charged twice",
            description="The order appears twice on my statement.",
            issue_type=Ticket.IssueType.INCIDENT,
            request_key=request_key,
        )
        retry = self.workflow.create_draft(
            self.customer,
            subject="Payment was charged twice",
            description="The order appears twice on my statement.",
            issue_type=Ticket.IssueType.INCIDENT,
            request_key=request_key,
        )
        self.assertEqual(first.pk, retry.pk)
        self.assertEqual(Ticket.objects.filter(customer=self.customer).count(), 1)

        submitted = self.workflow.submit(first, self.customer, request_key=request_key)
        submit_retry = self.workflow.submit(first, self.customer, request_key=request_key)
        self.assertEqual(submitted.pk, submit_retry.pk)
        self.assertEqual(Ticket.objects.filter(customer=self.customer).count(), 1)
        self.assertEqual(submitted.predictions.count(), 1)

    def test_submission_uses_active_deployment_not_client_selected_family(self):
        ModelDeployment.objects.create(
            family=ModelDeployment.Family.JOINT,
            version="joint-test",
            artifact_directory="artifacts/models/joint",
            is_active=False,
        )
        ModelDeployment.objects.create(
            family=ModelDeployment.Family.SEPARATE,
            version="separate-test",
            artifact_directory="artifacts/models/separate",
            is_active=True,
        )

        ticket = self.workflow.submit(self._draft(), self.customer, model_family=ModelDeployment.Family.JOINT)

        self.assertEqual(ticket.model_family, ModelDeployment.Family.SEPARATE)
        self.assertEqual(ticket.predictions.get().model_family, ModelDeployment.Family.SEPARATE)

    def test_staff_reroute_removes_assignment_and_preserves_prediction(self):
        ticket = self.workflow.submit(self._draft(), self.customer)
        ticket = self.workflow.claim(ticket, self.staff)
        ticket = self.workflow.request_reroute(ticket, self.staff, "This is an HR access issue, not technical support.")

        ticket.refresh_from_db()
        self.assertEqual(ticket.status, Ticket.Status.OPEN)
        self.assertIsNone(ticket.assigned_to)
        self.assertTrue(ticket.routing_failed)
        self.assertEqual(ticket.predictions.count(), 1)
        self.assertEqual(ticket.predictions.first().predicted_queue, "Technical Support")

    def test_admin_can_force_close_but_staff_cannot_reply_to_closed_ticket(self):
        ticket = self.workflow.submit(self._draft(), self.customer)
        ticket = self.workflow.force_close(ticket, self.admin, "Duplicate request confirmed by administrator.")
        self.assertEqual(ticket.status, Ticket.Status.CLOSED)
        self.assertEqual(ticket.resolution_source, Ticket.ResolutionSource.ADMIN_FORCE_CLOSE)
        self.assertEqual(ticket.force_close_reason, "Duplicate request confirmed by administrator.")

        with self.assertRaises(ValidationError):
            self.workflow.force_close(ticket, self.admin, "")
        with self.assertRaises(PermissionDenied):
            self.workflow.reply(ticket, self.staff, "This must not be sent.")

    def test_lifecycle_auto_resolves_after_24_hours_and_closes_after_72_hours(self):
        ticket = self.workflow.submit(self._draft(), self.customer)
        ticket = self.workflow.claim(ticket, self.staff)
        ticket = self.workflow.reply(ticket, self.staff, "Please confirm whether the new link works.")

        self.now += timedelta(hours=24, minutes=1)
        self.assertEqual(self.workflow.auto_resolve_due_customer_replies(), 1)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, Ticket.Status.RESOLVED)
        self.assertEqual(ticket.resolution_source, Ticket.ResolutionSource.AUTOMATIC_NO_REPLY)

        self.now += timedelta(days=3, minutes=1)
        self.assertEqual(self.workflow.close_due_resolved_tickets(), 1)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, Ticket.Status.CLOSED)
        self.assertEqual(ticket.force_close_reason, "Customer did not reopen the resolved ticket within 3 days.")
