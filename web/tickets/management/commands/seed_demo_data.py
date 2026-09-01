from django.contrib.auth.password_validation import validate_password
from django.core.management.base import BaseCommand

from web.accounts.models import User
from web.tickets.models import Queue, StaffAssignment

DEMO_PASSWORD = "DemoP@ssw0rd"

QUEUE_NAMES = (
    "Technical Support",
    "Product Support",
    "Customer Service",
    "Billing and Payments",
    "Returns and Exchanges",
    "Service Outages and Maintenance",
    "Sales and Pre-Sales",
    "Human Resources",
    "General Inquiry",
)


class Command(BaseCommand):
    help = "Create the local development queues and three demo accounts."

    def add_arguments(self, parser):
        parser.add_argument(
            "--password",
            default=DEMO_PASSWORD,
            help=f"Password for demo accounts. Defaults to {DEMO_PASSWORD}.",
        )

    def handle(self, *args, **options):
        password = options["password"]
        validate_password(password)
        queues = {name: Queue.objects.get_or_create(name=name)[0] for name in QUEUE_NAMES}
        accounts = (
            ("weilun.lim@gmail.com", "Wei Lun", "Lim", User.Role.CUSTOMER, None),
            ("nicholas.yee@yahoo.com", "Nicholas", "Yee", User.Role.STAFF, "Technical Support"),
            ("chunming.chan@admin.com", "Chun Ming", "Chan", User.Role.ADMIN, None),
        )
        for email, first_name, last_name, role, queue_name in accounts:
            person, created = User.objects.get_or_create(
                email=email,
                defaults={"first_name": first_name, "last_name": last_name, "role": role, "is_staff": role == User.Role.ADMIN},
            )
            # These are local-only demo identities. Reset the password on each
            # seed run so the documented demo credential stays deterministic.
            person.set_password(password)
            person.save(update_fields=["password"])
            if queue_name:
                StaffAssignment.objects.update_or_create(staff=person, active=True, defaults={"queue": queues[queue_name]})
            self.stdout.write(f"{'Created' if created else 'Kept'} {role.lower()} account {email}")
        self.stdout.write(self.style.SUCCESS("Queues and demo accounts are ready."))
