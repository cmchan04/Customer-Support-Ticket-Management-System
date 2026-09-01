from __future__ import annotations

from django.contrib.auth.password_validation import validate_password
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from web.accounts.models import User
from web.audit.models import AuditEvent

from ...ecommerce_demo import (
    ADMIN_ROSTER,
    DEMO_MODEL_VERSION_PREFIX,
    DEMO_PASSWORD,
    STAFF_ROSTER,
)
from ...models import Ticket

BASE_DEMO_EMAILS = (
    "weilun.lim@gmail.com",
    "nicholas.yee@yahoo.com",
    "chunming.chan@admin.com",
    "maya.lim@gmail.com",
    "arun.patel@outlook.com",
    "aisha.tan@gmail.com",
)


class Command(BaseCommand):
    help = "Retire synthetic e-commerce tickets and reset local demo account passwords."

    def add_arguments(self, parser):
        parser.add_argument(
            "--password",
            default=DEMO_PASSWORD,
            help=f"Password for demo accounts. Defaults to {DEMO_PASSWORD}.",
        )

    def handle(self, *args, **options):
        password = options["password"]
        validate_password(password)
        demo_tickets = Ticket.objects.filter(model_version__startswith=DEMO_MODEL_VERSION_PREFIX)
        ticket_count = demo_tickets.count()

        roster_emails = {
            email for _first, _last, email, _queue in STAFF_ROSTER
        }
        roster_emails.update(email for _first, _last, email in ADMIN_ROSTER)
        roster_emails.update(BASE_DEMO_EMAILS)
        demo_users = User.objects.filter(
            Q(email__in=roster_emails)
            | Q(customer_tickets__model_version__startswith=DEMO_MODEL_VERSION_PREFIX)
            | Q(assigned_tickets__model_version__startswith=DEMO_MODEL_VERSION_PREFIX)
        ).distinct()

        now = timezone.now()
        with transaction.atomic():
            active_demo_tickets = demo_tickets.exclude(status=Ticket.Status.CLOSED)
            retired_count = active_demo_tickets.update(
                status=Ticket.Status.CLOSED,
                resolved_at=now,
                customer_review_until=None,
                closed_at=now,
                resolution_source=Ticket.ResolutionSource.SYSTEM,
                force_close_reason="Synthetic demo record retired from the live workflow.",
                closed_by=None,
                updated_at=now,
            )

            password_count = 0
            for person in demo_users.iterator():
                person.set_password(password)
                person.save(update_fields=["password"])
                password_count += 1

            AuditEvent.objects.create(
                actor=None,
                category=AuditEvent.Category.SYSTEM,
                action="Retired synthetic e-commerce demo dataset",
                object_type="DemoDataBatch",
                object_id=DEMO_MODEL_VERSION_PREFIX.rstrip("-"),
                detail={
                    "tickets_found": ticket_count,
                    "tickets_closed": retired_count,
                    "demo_accounts_reset": password_count,
                    "model_accuracy_data": "synthetic records retained for operational history only",
                },
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Retired {retired_count} of {ticket_count} synthetic tickets as CLOSED and reset {password_count} demo account passwords."
            )
        )
