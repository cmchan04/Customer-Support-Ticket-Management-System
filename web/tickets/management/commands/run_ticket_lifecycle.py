from django.core.management.base import BaseCommand

from web.tickets.workflow import TicketWorkflow


class Command(BaseCommand):
    help = "Resolve unanswered tickets after 24 hours and close resolved tickets after 72 hours."

    def handle(self, *args, **options):
        result = TicketWorkflow().lifecycle_tick()
        self.stdout.write(self.style.SUCCESS(f"Auto-resolved: {result['auto_resolved']}; auto-closed: {result['auto_closed']}"))
