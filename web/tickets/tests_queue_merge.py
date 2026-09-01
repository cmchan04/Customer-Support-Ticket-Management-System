from __future__ import annotations

from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from web.accounts.models import User
from web.audit.models import AuditEvent

from .models import PredictionRecord, Queue, RerouteRequest, StaffAssignment, Ticket


class SupportQueueMergeCommandTests(TestCase):
    def test_merge_normalizes_live_and_prediction_records_and_is_repeatable(self):
        customer = User.objects.create_user(
            email="customer@gmail.com",
            password="Password1!",
            first_name="Maya",
            last_name="Lim",
            role=User.Role.CUSTOMER,
        )
        staff = User.objects.create_user(
            email="staff@gmail.com",
            password="Password1!",
            first_name="Amir",
            last_name="Yusof",
            role=User.Role.STAFF,
        )
        technical = Queue.objects.create(name="Technical Support")
        it_support = Queue.objects.create(name="IT Support")
        assignment = StaffAssignment.objects.create(staff=staff, queue=it_support)
        ticket = Ticket.objects.create(
            customer=customer,
            subject="Seller portal access",
            description="The seller portal is unavailable.",
            issue_type=Ticket.IssueType.INCIDENT,
            status=Ticket.Status.CLOSED,
            queue=it_support,
            predicted_queue="IT Support",
            predicted_priority=Ticket.Priority.HIGH,
        )
        prediction = PredictionRecord.objects.create(
            ticket=ticket,
            model_family=PredictionRecord.ModelFamily.JOINT,
            model_version="legacy",
            predicted_queue="IT Support",
            predicted_priority=Ticket.Priority.HIGH,
        )
        reroute = RerouteRequest.objects.create(
            ticket=ticket,
            requested_by=staff,
            reason="Legacy route correction",
            previous_queue="IT Support",
        )

        call_command("merge_support_queues", "--apply", stdout=StringIO())

        self.assertFalse(Queue.objects.filter(name="IT Support").exists())
        self.assertEqual(Queue.objects.get(name="Technical Support").pk, technical.pk)
        assignment.refresh_from_db()
        ticket.refresh_from_db()
        prediction.refresh_from_db()
        reroute.refresh_from_db()
        self.assertEqual(assignment.queue_id, technical.pk)
        self.assertEqual(ticket.queue_id, technical.pk)
        self.assertEqual(ticket.predicted_queue, "Technical Support")
        self.assertEqual(prediction.predicted_queue, "Technical Support")
        self.assertEqual(reroute.previous_queue, "Technical Support")
        self.assertTrue(
            AuditEvent.objects.filter(action="Merged support queues", object_id=str(technical.pk)).exists()
        )

        # A second run is a safe no-op after the source queue has been removed.
        call_command("merge_support_queues", "--apply", stdout=StringIO())
        self.assertEqual(Queue.objects.filter(name="Technical Support").count(), 1)
