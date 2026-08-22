from __future__ import annotations

from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from web.accounts.models import User

from .models import PredictionRecord, Ticket, TicketMessage


class EcommerceDemoDataCommandTests(TestCase):
    """The synthetic dataset is repeatable and safe to run more than once."""

    command_arguments = (
        "--apply",
        "--start-date",
        "2026-08-19",
        "--days",
        "2",
        "--daily-tickets",
        "3",
        "--customers",
        "5",
        "--seed",
        "9",
        "--password",
        "EcomDemo2026!",
    )

    def run_command(self) -> None:
        call_command("seed_ecommerce_demo_data", *self.command_arguments, stdout=StringIO())

    def test_creates_realistic_lifecycle_records_and_is_idempotent(self):
        self.run_command()

        self.assertEqual(Ticket.objects.count(), 6)
        self.assertEqual(User.objects.filter(role=User.Role.CUSTOMER).count(), 5)
        self.assertEqual(User.objects.filter(role=User.Role.STAFF).count(), 20)
        self.assertEqual(User.objects.filter(role=User.Role.ADMIN).count(), 2)
        self.assertEqual(PredictionRecord.objects.count(), 6)
        self.assertGreaterEqual(TicketMessage.objects.count(), 6)

        first_ticket = Ticket.objects.order_by("created_at").first()
        self.assertIsNotNone(first_ticket)
        self.assertEqual(first_ticket.created_at.date().isoformat(), "2026-08-19")
        self.assertEqual(first_ticket.model_version, "synthetic-ecommerce-demo-2026.08")
        self.assertTrue(
            set(Ticket.objects.values_list("status", flat=True))
            <= {Ticket.Status.RESOLVED, Ticket.Status.CLOSED}
        )

        self.run_command()
        self.assertEqual(Ticket.objects.count(), 6)

    def test_retire_command_closes_existing_batch_and_resets_demo_password(self):
        self.run_command()
        call_command("retire_demo_data", stdout=StringIO())

        self.assertFalse(
            Ticket.objects.exclude(status=Ticket.Status.CLOSED).exists()
        )
        self.assertTrue(
            User.objects.get(email="nuraisyah.rahman1@gmail.com").check_password("DemoP@ssw0rd")
        )
