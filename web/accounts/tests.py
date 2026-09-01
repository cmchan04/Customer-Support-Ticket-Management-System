from django.test import TestCase
from django.urls import reverse

from web.tickets.models import Queue, StaffAssignment

from .models import User


class AuthenticatedWorkspaceTests(TestCase):
    def setUp(self):
        self.customer = User.objects.create_user(
            email="wei.lun@gmail.com",
            password="Password1!",
            first_name="Wei",
            last_name="Lun",
            role=User.Role.CUSTOMER,
        )

    def test_home_renders_the_established_workspace_shell(self):
        self.client.force_login(self.customer)

        response = self.client.get(reverse("home"))

        self.assertContains(response, 'class="app-shell"')
        self.assertContains(response, "window.ticketServerSession")
        self.assertContains(response, 'base href="/static/"')
        self.assertNotContains(response, "database-backed dashboard endpoint")

    def test_logout_uses_post_and_returns_to_login(self):
        self.client.force_login(self.customer)

        response = self.client.post(reverse("logout"))

        self.assertRedirects(response, reverse("login"))
        self.assertNotIn("_auth_user_id", self.client.session)

    def test_queue_directory_filter_does_not_limit_assignment_staff(self):
        admin = User.objects.create_user(
            email="admin@admin.com",
            password="Password1!",
            first_name="Admin",
            role=User.Role.ADMIN,
        )
        technical = Queue.objects.create(name="Technical Support")
        billing = Queue.objects.create(name="Billing and Payments")
        technical_staff = User.objects.create_user(
            email="technical@outlook.com",
            password="Password1!",
            first_name="Technical",
            role=User.Role.STAFF,
        )
        billing_staff = User.objects.create_user(
            email="billing@gmail.com",
            password="Password1!",
            first_name="Billing",
            role=User.Role.STAFF,
        )
        StaffAssignment.objects.create(staff=technical_staff, queue=technical)
        StaffAssignment.objects.create(staff=billing_staff, queue=billing)
        self.client.force_login(admin)

        response = self.client.get(reverse("admin-queues-staff"), {"queue_id": technical.pk})

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual([row["name"] for row in payload["staff"]], ["Technical"])
        self.assertEqual({row["name"] for row in payload["assignment_staff"]}, {"Technical", "Billing"})
