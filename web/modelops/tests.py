from django.test import TestCase
from django.urls import reverse

from web.accounts.models import User
from web.tickets.models import Queue, Ticket

from .evaluation import live_model_metrics
from .models import ModelDeployment


class LiveModelEvaluationTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="admin@admin.com",
            password="Password1!",
            first_name="Chun Ming",
            last_name="Chan",
            role=User.Role.ADMIN,
        )
        self.customer = User.objects.create_user(
            email="customer@gmail.com",
            password="Password1!",
            first_name="Wei",
            last_name="Lim",
            role=User.Role.CUSTOMER,
        )
        self.technical = Queue.objects.create(name="Technical Support")
        self.billing = Queue.objects.create(name="Billing and Payments")
        ModelDeployment.objects.create(
            family=ModelDeployment.Family.JOINT,
            version="2026.08.21",
            artifact_directory="artifacts/models/joint",
        )

    def test_live_metrics_compare_original_prediction_with_final_closed_outcome(self):
        Ticket.objects.create(
            customer=self.customer,
            subject="VPN issue",
            description="Cannot connect.",
            issue_type=Ticket.IssueType.INCIDENT,
            status=Ticket.Status.CLOSED,
            model_family=ModelDeployment.Family.JOINT,
            predicted_queue=self.technical.name,
            predicted_priority=Ticket.Priority.HIGH,
            queue=self.technical,
            priority=Ticket.Priority.HIGH,
        )
        Ticket.objects.create(
            customer=self.customer,
            subject="Refund issue",
            description="Refund missing.",
            issue_type=Ticket.IssueType.REQUEST,
            status=Ticket.Status.CLOSED,
            model_family=ModelDeployment.Family.JOINT,
            predicted_queue=self.technical.name,
            predicted_priority=Ticket.Priority.HIGH,
            queue=self.billing,
            priority=Ticket.Priority.LOW,
        )

        metrics = live_model_metrics(ModelDeployment.Family.JOINT)

        self.assertEqual(metrics["reviewed_count"], 2)
        self.assertEqual(metrics["queue_wrong_count"], 1)
        self.assertEqual(metrics["priority_wrong_count"], 1)
        self.assertAlmostEqual(metrics["queue_macro_f1"], 1 / 3)
        self.assertAlmostEqual(metrics["priority_macro_f1"], 1 / 3)

    def test_deployment_endpoint_exposes_live_macro_f1(self):
        Ticket.objects.create(
            customer=self.customer,
            subject="VPN issue",
            description="Cannot connect.",
            issue_type=Ticket.IssueType.INCIDENT,
            status=Ticket.Status.CLOSED,
            model_family=ModelDeployment.Family.JOINT,
            predicted_queue=self.technical.name,
            predicted_priority=Ticket.Priority.HIGH,
            queue=self.billing,
            priority=Ticket.Priority.LOW,
        )
        self.client.force_login(self.admin)

        response = self.client.get(reverse("model-deployments"))

        self.assertEqual(response.status_code, 200)
        deployment = response.json()["deployments"][0]
        self.assertEqual(deployment["live_reviewed_count"], 1)
        self.assertIn("live_queue_macro_f1", deployment)
        self.assertIn("live_priority_macro_f1", deployment)

    def test_deployment_endpoint_exposes_fixed_training_scores_separately(self):
        deployment = ModelDeployment.objects.get(family=ModelDeployment.Family.JOINT)
        deployment.queue_macro_f1 = 0.7949
        deployment.priority_macro_f1 = 0.7995
        deployment.priority_accuracy = 0.8026
        deployment.save(update_fields=["queue_macro_f1", "priority_macro_f1", "priority_accuracy"])
        self.client.force_login(self.admin)

        response = self.client.get(reverse("model-deployments"))

        self.assertEqual(response.status_code, 200)
        row = response.json()["deployments"][0]
        self.assertAlmostEqual(row["queue_macro_f1"], 0.7949)
        self.assertAlmostEqual(row["priority_macro_f1"], 0.7995)
        self.assertAlmostEqual(row["priority_accuracy"], 0.8026)
