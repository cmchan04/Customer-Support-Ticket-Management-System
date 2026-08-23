from django.test import TestCase
from django.urls import reverse

from web.accounts.models import User
from web.tickets.models import Queue, StaffAssignment, Ticket

from .queries import DashboardQueries


class DashboardVisibilityTests(TestCase):
    def setUp(self):
        self.customer = User.objects.create_user(
            email="customer@gmail.com", password="Password1!", first_name="Customer", role=User.Role.CUSTOMER
        )
        self.staff = User.objects.create_user(
            email="staff@outlook.com", password="Password1!", first_name="Staff", role=User.Role.STAFF
        )
        self.admin = User.objects.create_user(
            email="admin@admin.com", password="Password1!", first_name="Admin", role=User.Role.ADMIN
        )
        self.queue = Queue.objects.create(name="Technical Support")
        StaffAssignment.objects.create(staff=self.staff, queue=self.queue)
        self.closed = Ticket.objects.create(
            customer=self.customer,
            subject="Archived issue",
            description="This ticket is closed.",
            issue_type=Ticket.IssueType.INCIDENT,
            status=Ticket.Status.CLOSED,
            queue=self.queue,
            assigned_to=self.staff,
            priority=Ticket.Priority.LOW,
        )

    def test_closed_ticket_is_hidden_from_customer_and_staff_but_reviewable_in_staff_performance(self):
        queries = DashboardQueries()
        self.assertEqual(queries.customer_dashboard(self.customer)["tickets"], [])
        self.assertEqual(queries.customer_dashboard(self.customer)["active_count"], 0)
        staff_rows = queries.staff_performance(self.staff)["recent_resolved_work"]
        self.assertEqual(len(staff_rows), 1)
        self.assertEqual(staff_rows[0]["status"], Ticket.Status.CLOSED)
        admin_rows = queries.admin_ticket_management()["all_tickets"]
        self.assertEqual(len(admin_rows), 1)
        self.assertEqual(admin_rows[0]["status"], Ticket.Status.CLOSED)

        self.client.force_login(self.customer)
        response = self.client.get(reverse("ticket-detail", args=[self.closed.pk]))
        self.assertEqual(response.status_code, 404)

    def test_customer_responses_hide_priority_and_internal_routing_evidence(self):
        active = Ticket.objects.create(
            customer=self.customer,
            subject="Payment needs review",
            description="The payment page returned an error.",
            issue_type=Ticket.IssueType.INCIDENT,
            status=Ticket.Status.OPEN,
            queue=self.queue,
            priority=Ticket.Priority.HIGH,
            predicted_queue=self.queue.name,
            predicted_priority=Ticket.Priority.HIGH,
            model_family="joint",
        )

        customer_summary = DashboardQueries().customer_dashboard(self.customer)["tickets"][0]
        for field in (
            "priority",
            "queue",
            "predicted_priority",
            "predicted_queue",
            "model_family",
            "queue_confidence_percent",
            "priority_confidence_percent",
            "previous_predictions",
            "reroute_requests",
        ):
            self.assertNotIn(field, customer_summary)

        self.client.force_login(self.customer)
        customer_response = self.client.get(reverse("ticket-detail", args=[active.pk]))
        self.assertEqual(customer_response.status_code, 200)
        customer_detail = customer_response.json()
        self.assertNotIn("priority", customer_detail)
        self.assertNotIn("queue", customer_detail)
        self.assertNotIn("predictions", customer_detail)

        self.client.force_login(self.staff)
        staff_detail = self.client.get(reverse("ticket-detail", args=[active.pk])).json()
        self.assertEqual(staff_detail["priority"], Ticket.Priority.HIGH)
        self.assertEqual(staff_detail["queue"], self.queue.name)

    def test_drafts_do_not_count_as_operational_backlog(self):
        Ticket.objects.create(
            customer=self.customer,
            subject="Unfinished draft",
            description="",
            issue_type="",
            status=Ticket.Status.DRAFT,
        )
        queries = DashboardQueries()
        self.assertEqual(queries.admin_overview()["open_backlog"], 0)
        self.assertEqual(queries.customer_dashboard(self.customer)["draft_count"], 1)
        self.assertEqual(len(queries.admin_ticket_management()["all_tickets"]), 2)

    def test_admin_ticket_management_returns_the_complete_dataset_for_client_paging(self):
        Ticket.objects.bulk_create(
            [
                Ticket(
                    customer=self.customer,
                    subject=f"Bulk ticket {index}",
                    description="A ticket used to verify the management list is not truncated.",
                    issue_type=Ticket.IssueType.INCIDENT,
                    status=Ticket.Status.OPEN,
                    queue=self.queue,
                )
                for index in range(501)
            ]
        )

        rows = DashboardQueries().admin_ticket_management()["all_tickets"]

        self.assertEqual(len(rows), 502)

    def test_admin_ticket_management_filters_and_paginates_in_the_query(self):
        Ticket.objects.bulk_create(
            [
                Ticket(
                    customer=self.customer,
                    subject=f"Payment problem {index}",
                    description="The checkout payment needs review.",
                    issue_type=Ticket.IssueType.INCIDENT,
                    status=Ticket.Status.OPEN,
                    queue=self.queue,
                    priority=Ticket.Priority.HIGH,
                )
                for index in range(25)
            ]
        )

        result = DashboardQueries().admin_ticket_management(
            page=2,
            page_size=10,
            search="Payment problem",
            priority="High",
            sort="reference",
            direction="asc",
        )

        self.assertEqual(result["all_pagination"]["page"], 2)
        self.assertEqual(result["all_pagination"]["page_size"], 10)
        self.assertEqual(result["filtered_all_count"], 25)
        self.assertEqual(len(result["all_tickets"]), 10)

    def test_staff_filters_and_paginates_assigned_work_in_the_query(self):
        Ticket.objects.bulk_create(
            [
                Ticket(
                    customer=self.customer,
                    subject=f"Assigned request {index}",
                    description="Assigned work.",
                    issue_type=Ticket.IssueType.REQUEST,
                    status=Ticket.Status.WAITING_FOR_SUPPORT,
                    queue=self.queue,
                    assigned_to=self.staff,
                    priority=Ticket.Priority.MEDIUM,
                )
                for index in range(12)
            ]
        )

        result = DashboardQueries().staff_dashboard(
            self.staff,
            my_tickets_page=2,
            page_size=10,
            my_priority="Medium",
            my_search="Assigned request",
            my_sort="lastUpdated",
        )

        self.assertEqual(result["tickets_pagination"]["page"], 2)
        self.assertEqual(result["tickets_pagination"]["total"], 12)
        self.assertEqual(len(result["tickets"]), 2)
