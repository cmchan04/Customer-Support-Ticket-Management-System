from __future__ import annotations

from datetime import date, timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from web.tickets.ecommerce_demo import DEMO_PASSWORD, EcommerceDemoSeeder


class Command(BaseCommand):
    help = "Preview or insert a deterministic Malaysia-focused e-commerce support dataset."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Insert the reviewed synthetic dataset into SQLite.")
        parser.add_argument("--start-date", help="First submission date in YYYY-MM-DD format. Defaults to 61 days before today.")
        parser.add_argument("--days", type=int, default=61, help="Number of historical days to generate. Default: 61.")
        parser.add_argument("--daily-tickets", type=int, default=20, help="Tickets per day. Default: 20.")
        parser.add_argument("--customers", type=int, default=180, help="Number of synthetic customer accounts. Default: 180.")
        parser.add_argument("--seed", type=int, default=20260821, help="Deterministic random seed. Default: 20260821.")
        parser.add_argument(
            "--password",
            default=DEMO_PASSWORD,
            help=f"Shared local-development password for synthetic accounts. Defaults to {DEMO_PASSWORD}.",
        )

    def handle(self, *args, **options):
        start_date = self._start_date(options["start_date"], options["days"])
        try:
            seeder = EcommerceDemoSeeder(
                start_date=start_date,
                days=options["days"],
                daily_tickets=options["daily_tickets"],
                customer_count=options["customers"],
                seed=options["seed"],
            )
        except ValueError as exc:
            raise CommandError(str(exc)) from exc

        self._write_preview(seeder.summary())
        if not options["apply"]:
            self.stdout.write(self.style.WARNING("Preview only: no database records were changed. Add --apply after review."))
            return

        try:
            result = seeder.apply(password=options["password"])
        except ValueError as exc:
            raise CommandError(str(exc)) from exc
        if result["already_present"]:
            self.stdout.write(self.style.WARNING(f"This batch is already present: {result['batch_key']}. No duplicate tickets were inserted."))
            return
        self.stdout.write(
            self.style.SUCCESS(
                f"Inserted {result['tickets']} synthetic tickets and {result['users']} new users. Batch: {result['batch_key']}"
            )
        )

    @staticmethod
    def _start_date(value: str | None, days: int) -> date:
        if days < 1:
            raise CommandError("--days must be at least 1.")
        if not value:
            return timezone.localdate() - timedelta(days=days)
        try:
            return date.fromisoformat(value)
        except ValueError as exc:
            raise CommandError("--start-date must use YYYY-MM-DD format.") from exc

    def _write_preview(self, summary: dict[str, object]) -> None:
        self.stdout.write(f"Batch: {summary['batch_key']}")
        self.stdout.write(f"Period: {summary['date_range']} | {summary['tickets']} tickets | {summary['daily_tickets']} per day")
        self.stdout.write(
            f"Accounts to ensure: {summary['customers']} customers | {summary['staff']} staff | {summary['admins']} administrators"
        )
        self.stdout.write(f"Ticket statuses: {self._format_counts(summary['statuses'])}")
        self.stdout.write(f"Priorities: {self._format_counts(summary['priorities'])}")
        self.stdout.write(f"Routing scenarios: {self._format_counts(summary['routing'])}")
        self.stdout.write("Queue distribution:")
        for name, count in summary["queues"].items():
            self.stdout.write(f"  - {name}: {count}")
        self.stdout.write("Sample tickets:")
        for sample in summary["samples"]:
            self.stdout.write(
                f"  - {sample['date']} | {sample['customer']} | {sample['status']} | {sample['queue']} | {sample['priority']} | {sample['subject']}"
            )

    @staticmethod
    def _format_counts(counts: dict[str, int]) -> str:
        return ", ".join(f"{name}={count}" for name, count in counts.items())
