from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from web.audit.models import AuditEvent

from ...models import PredictionRecord, Queue, RerouteRequest, StaffAssignment, Ticket

SOURCE_QUEUE = "IT Support"
TARGET_QUEUE = "Technical Support"


class Command(BaseCommand):
    help = "Merge IT Support into Technical Support across the existing database."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Apply the merge. Without this flag, only a change summary is shown.",
        )

    def handle(self, *args, **options):
        source = Queue.objects.filter(name=SOURCE_QUEUE).first()
        target = Queue.objects.filter(name=TARGET_QUEUE).first()

        if source is None and target is None:
            if options["apply"]:
                target = Queue.objects.create(
                    name=TARGET_QUEUE,
                    description="System access, account, and technical troubleshooting requests.",
                )
                self.stdout.write(self.style.SUCCESS("Created Technical Support; no IT Support records existed."))
            else:
                self.stdout.write("No IT Support or Technical Support queue exists. Nothing to merge.")
            return

        if source is None:
            self.stdout.write("IT Support queue is already absent; existing data is already merged.")
            return

        if target is None:
            if not options["apply"]:
                self.stdout.write(
                    f"Technical Support does not exist. Applying would rename the queue to {TARGET_QUEUE}."
                )
                return
            target = Queue.objects.create(
                name=TARGET_QUEUE,
                description="System access, account, and technical troubleshooting requests.",
            )

        counts = {
            "tickets_reassigned": Ticket.objects.filter(queue_id=source.pk).count(),
            "staff_assignments_moved": StaffAssignment.objects.filter(queue_id=source.pk).count(),
            "ticket_predictions_normalized": Ticket.objects.filter(predicted_queue=SOURCE_QUEUE).count(),
            "prediction_records_normalized": PredictionRecord.objects.filter(predicted_queue=SOURCE_QUEUE).count(),
            "reroute_history_normalized": RerouteRequest.objects.filter(previous_queue=SOURCE_QUEUE).count(),
        }
        self.stdout.write(f"{SOURCE_QUEUE} -> {TARGET_QUEUE}")
        for name, count in counts.items():
            self.stdout.write(f"  {name.replace('_', ' ')}: {count}")

        if not options["apply"]:
            self.stdout.write(self.style.WARNING("Preview only: no database records were changed. Add --apply to apply the merge."))
            return

        with transaction.atomic():
            # Lock both rows so a concurrent queue/staff edit cannot observe a
            # half-completed merge.
            source = Queue.objects.select_for_update().get(pk=source.pk)
            target = Queue.objects.select_for_update().get(pk=target.pk)

            Ticket.objects.filter(queue_id=source.pk).update(queue_id=target.pk)
            StaffAssignment.objects.filter(queue_id=source.pk).update(queue_id=target.pk)
            Ticket.objects.filter(predicted_queue=SOURCE_QUEUE).update(predicted_queue=TARGET_QUEUE)
            PredictionRecord.objects.filter(predicted_queue=SOURCE_QUEUE).update(predicted_queue=TARGET_QUEUE)
            RerouteRequest.objects.filter(previous_queue=SOURCE_QUEUE).update(previous_queue=TARGET_QUEUE)

            source.delete()
            AuditEvent.objects.create(
                actor=None,
                category=AuditEvent.Category.SYSTEM,
                action="Merged support queues",
                object_type="Queue",
                object_id=str(target.pk),
                detail={
                    "source_queue": SOURCE_QUEUE,
                    "target_queue": TARGET_QUEUE,
                    **counts,
                    "source_queue_deleted": True,
                    "model_label_change": "IT Support predictions are normalized to Technical Support.",
                },
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Merged {SOURCE_QUEUE} into {TARGET_QUEUE}; reassigned {counts['tickets_reassigned']} tickets "
                f"and moved {counts['staff_assignments_moved']} staff assignments."
            )
        )
