"""Deterministic, Malaysia-focused e-commerce demo data for local testing.

The generator deliberately writes synthetic labels and confidence values rather
than invoking the persisted ML artifacts thousands of times.  This keeps the
dataset clearly separate from real predictions while still exercising the
complete ticket, SLA, reroute, reporting, and audit data model.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from random import Random

from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.utils import timezone

from web.accounts.models import User
from web.audit.models import AuditEvent

from .models import PredictionRecord, Queue, RerouteRequest, StaffAssignment, Ticket, TicketMessage
from .sla import targets_for

DEMO_PASSWORD = "DemoP@ssw0rd"
DEMO_MODEL_VERSION_PREFIX = "synthetic-ecommerce-demo-"

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

EMAIL_DOMAINS = ("gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com")
PRODUCTS = (
    "wireless earbuds",
    "portable blender",
    "laptop sleeve",
    "smart watch",
    "standing desk lamp",
    "robot vacuum",
    "air fryer",
    "phone case",
    "water bottle",
    "gaming mouse",
)


@dataclass(frozen=True)
class Scenario:
    subject: str
    description: str
    issue_type: str


@dataclass(frozen=True)
class TicketPlan:
    submitted_at: datetime
    customer_index: int
    queue_name: str
    priority: str
    status: str
    routing_kind: str
    subject: str
    description: str
    issue_type: str
    model_family: str
    queue_confidence: Decimal | None
    priority_confidence: Decimal | None


SCENARIOS: dict[str, tuple[Scenario, ...]] = {
    "Technical Support": (
        Scenario("Unable to sign in to my account", "I cannot sign in to the marketplace app. The sign-in page returns to the login screen after I enter my details.", Ticket.IssueType.INCIDENT),
        Scenario("Checkout page freezes for order {order}", "The checkout page freezes after I select payment for order {order}. I have tried both Wi-Fi and mobile data.", Ticket.IssueType.INCIDENT),
        Scenario("Mobile app crashes when opening my orders", "The app closes whenever I open My Orders. I am using the latest version on my phone.", Ticket.IssueType.PROBLEM),
        Scenario("Seller portal cannot load inventory page", "The seller portal shows an error when I open the inventory page. I need to update stock for today’s orders.", Ticket.IssueType.INCIDENT),
        Scenario("Need access to the seller analytics report", "Please grant access to the sales and analytics report for our marketplace seller account.", Ticket.IssueType.REQUEST),
        Scenario("Two-factor code is not arriving", "I cannot receive the two-factor verification code for the seller portal, so I cannot manage our store.", Ticket.IssueType.INCIDENT),
    ),
    "Product Support": (
        Scenario("{product} received is different from the listing", "Order {order} arrived today, but the {product} does not match the size, colour, or specification shown in the listing.", Ticket.IssueType.INCIDENT),
        Scenario("Need help with product warranty details", "I would like to confirm the warranty coverage for the {product} purchased under order {order}.", Ticket.IssueType.REQUEST),
        Scenario("Product information is missing on the listing", "The listing for a {product} does not show the information I need before making a purchase.", Ticket.IssueType.PROBLEM),
    ),
    "Customer Service": (
        Scenario("Update delivery address for order {order}", "I entered the wrong delivery address for order {order}. Please let me know whether it can still be changed.", Ticket.IssueType.REQUEST),
        Scenario("Order {order} tracking has not updated", "The tracking status for order {order} has not changed for several days and I need an update on the delivery.", Ticket.IssueType.PROBLEM),
        Scenario("Question about my loyalty points", "My loyalty points balance looks different after a recent purchase. Please help me understand the change.", Ticket.IssueType.REQUEST),
    ),
    "Billing and Payments": (
        Scenario("Charged twice for order {order}", "My card appears to have been charged twice for order {order}. I have attached the two transaction references.", Ticket.IssueType.INCIDENT),
        Scenario("Refund for order {order} has not arrived", "The return for order {order} was approved, but the refund has not appeared in my bank account.", Ticket.IssueType.PROBLEM),
        Scenario("Payment was declined although funds are available", "Payment for order {order} was declined even though my bank confirmed that my card is active.", Ticket.IssueType.INCIDENT),
    ),
    "Returns and Exchanges": (
        Scenario("Request to return order {order}", "I would like to return the {product} from order {order}. The item is unused and still in its original packaging.", Ticket.IssueType.REQUEST),
        Scenario("Exchange requested for incorrect size", "The {product} in order {order} is the wrong size. Please advise how I can arrange an exchange.", Ticket.IssueType.REQUEST),
        Scenario("Return pickup has not been scheduled", "My return for order {order} was approved but I have not received a pickup date or return label.", Ticket.IssueType.PROBLEM),
    ),
    "Service Outages and Maintenance": (
        Scenario("Marketplace website is unavailable", "The marketplace website shows an error page and I cannot browse products or access my cart.", Ticket.IssueType.INCIDENT),
        Scenario("Order confirmation emails are delayed", "Several order confirmation emails are arriving much later than usual. Please check whether there is a service issue.", Ticket.IssueType.PROBLEM),
        Scenario("Planned maintenance question", "Will the planned maintenance affect checkout or order tracking this weekend?", Ticket.IssueType.REQUEST),
    ),
    "Sales and Pre-Sales": (
        Scenario("Request a quotation for bulk purchase", "Our company would like a quotation for a bulk purchase of {product}. Please share the available business pricing.", Ticket.IssueType.REQUEST),
        Scenario("Question about marketplace seller plans", "I am considering opening a seller store and would like to compare the available marketplace plans.", Ticket.IssueType.REQUEST),
        Scenario("Need product availability confirmation", "Can you confirm whether the {product} will be available in a larger quantity next month?", Ticket.IssueType.REQUEST),
    ),
    "Human Resources": (
        Scenario("Question about e-commerce warehouse job application", "I submitted an application for a warehouse role and would like to check whether further information is needed.", Ticket.IssueType.REQUEST),
        Scenario("Unable to access careers portal", "The careers portal does not allow me to complete my application after I upload my resume.", Ticket.IssueType.INCIDENT),
        Scenario("Request information about internship application", "I would like to ask about the application timeline for the e-commerce operations internship.", Ticket.IssueType.REQUEST),
    ),
    "General Inquiry": (
        Scenario("Question about platform delivery coverage", "I would like to know whether the marketplace delivers to my area and what the standard delivery charges are.", Ticket.IssueType.REQUEST),
        Scenario("Feedback about my shopping experience", "I would like to share feedback about the ordering experience and the product recommendations shown to me.", Ticket.IssueType.REQUEST),
        Scenario("Need help finding the correct support team", "I have a question about my marketplace account but I am not sure which support category applies.", Ticket.IssueType.REQUEST),
    ),
}

QUEUE_WEIGHTS = (26, 11, 16, 16, 10, 5, 5, 3, 8)

CUSTOMER_NAMES = (
    ("Nur Aisyah", "Rahman"), ("Muhammad Hakim", "Ismail"), ("Siti Nur", "Azman"), ("Ahmad Faris", "Yusof"),
    ("Aina Sofea", "Zulkifli"), ("Danish Iqbal", "Hassan"), ("Nurul Iman", "Salleh"), ("Amirul Hakim", "Razak"),
    ("Farah Nabila", "Jamaludin"), ("Syafiq Azlan", "Mahadi"), ("Hana Qistina", "Roslan"), ("Irfan Danish", "Kamarudin"),
    ("Wei Lun", "Lim"), ("Jia Yi", "Tan"), ("Kai Wen", "Wong"), ("Mei Qi", "Lee"),
    ("Zhi Hao", "Goh"), ("Ying Xuan", "Chong"), ("Jun Jie", "Yap"), ("Pei Shan", "Ong"),
    ("Chun Kit", "Teoh"), ("Xin Yi", "Koh"), ("Jian Hao", "Lau"), ("Siew Ling", "Cheah"),
    ("Kavitha", "Devi"), ("Arjun", "Kumar"), ("Priya", "Nair"), ("Viknesh", "Rajan"),
    ("Aarthi", "Subramaniam"), ("Sanjay", "Krishnan"), ("Divya", "Mohan"), ("Ramesh", "Pillai"),
    ("Dayang Amina", "Jamal"), ("Jolene", "Janting"), ("Benedict", "Julius"), ("Melanie", "Lawan"),
    ("Farisya", "Abdullah"), ("Calvin", "Anak Jali"), ("Alicia", "Mering"), ("Hafiz", "Mustapha"),
)

STAFF_ROSTER = (
    ("Nicholas", "Yee", "nicholas.yee@yahoo.com", "Technical Support"),
    ("Nur Aisyah", "Rahman", "nur.aisyah.rahman@gmail.com", "Technical Support"),
    ("Priya", "Nair", "priya.nair@outlook.com", "Product Support"),
    ("James", "Wong", "james.wong@hotmail.com", "Product Support"),
    ("Nur Aina", "Azman", "nur.aina.azman@gmail.com", "Customer Service"),
    ("Farah", "Ismail", "farah.ismail@yahoo.com", "Customer Service"),
    ("Kavitha", "Devi", "kavitha.devi@gmail.com", "Billing and Payments"),
    ("Lee", "Chen", "lee.chen@outlook.com", "Billing and Payments"),
    ("Muhammad Amir", "Yusof", "muhammad.amir.yusof@gmail.com", "Technical Support"),
    ("Yap", "Sze Min", "yap.szmin@yahoo.com", "Technical Support"),
    ("Siti Hawa", "Hassan", "siti.hawa.hassan@outlook.com", "Returns and Exchanges"),
    ("Goh", "Jin Wei", "goh.jinwei@hotmail.com", "Returns and Exchanges"),
    ("Arvind", "Kumar", "arvind.kumar@gmail.com", "Service Outages and Maintenance"),
    ("Tan", "Mei Ling", "tan.meiling@yahoo.com", "Service Outages and Maintenance"),
    ("Aiman", "Firdaus", "aiman.firdaus@outlook.com", "Sales and Pre-Sales"),
    ("Chong", "Yee Ting", "chong.yeeting@hotmail.com", "Sales and Pre-Sales"),
    ("Nabila", "Samsudin", "nabila.samsudin@gmail.com", "Human Resources"),
    ("Mohan", "Raj", "mohan.raj@yahoo.com", "Human Resources"),
    ("Liyana", "Salleh", "liyana.salleh@outlook.com", "General Inquiry"),
    ("Lim", "Jia Hui", "lim.jiahui@hotmail.com", "General Inquiry"),
)

ADMIN_ROSTER = (
    ("Aisha", "Tan", "aisha.tan@outlook.com"),
    ("Faridah", "Hassan", "faridah.hassan@gmail.com"),
)


class EcommerceDemoSeeder:
    """Build and persist a reproducible local e-commerce ticket dataset."""

    def __init__(
        self,
        *,
        start_date: date,
        days: int = 61,
        daily_tickets: int = 20,
        customer_count: int = 180,
        seed: int = 20260821,
        now: datetime | None = None,
    ) -> None:
        if days < 1 or daily_tickets < 1 or customer_count < 1:
            raise ValueError("Days, daily tickets, and customer count must all be positive.")
        self.start_date = start_date
        self.days = days
        self.daily_tickets = daily_tickets
        self.customer_count = customer_count
        self.seed = seed
        self.now = now or timezone.now()
        self.rng = Random(seed)
        self._plans: list[TicketPlan] | None = None

    @property
    def end_date(self) -> date:
        return self.start_date + timedelta(days=self.days - 1)

    @property
    def batch_key(self) -> str:
        return f"ecommerce-demo:{self.start_date.isoformat()}:{self.end_date.isoformat()}:{self.daily_tickets}:{self.seed}"

    def plans(self) -> list[TicketPlan]:
        if self._plans is None:
            self._plans = self._build_plans()
        return self._plans

    def summary(self) -> dict[str, object]:
        plans = self.plans()
        status_counts = Counter(plan.status for plan in plans)
        queue_counts = Counter(plan.queue_name for plan in plans)
        priority_counts = Counter(plan.priority or "Unclassified" for plan in plans)
        routing_counts = Counter(plan.routing_kind for plan in plans)
        return {
            "batch_key": self.batch_key,
            "date_range": f"{self.start_date.isoformat()} to {self.end_date.isoformat()}",
            "days": self.days,
            "daily_tickets": self.daily_tickets,
            "tickets": len(plans),
            "customers": self.customer_count,
            "staff": len(STAFF_ROSTER),
            "admins": len(ADMIN_ROSTER),
            "statuses": dict(sorted(status_counts.items())),
            "queues": dict(sorted(queue_counts.items())),
            "priorities": dict(sorted(priority_counts.items())),
            "routing": dict(sorted(routing_counts.items())),
            "samples": [
                {
                    "date": plan.submitted_at.date().isoformat(),
                    "customer": self._customer_identity(plan.customer_index)[0],
                    "queue": plan.queue_name if plan.routing_kind != "model_failure" else "Routing failed",
                    "priority": plan.priority or "Unclassified",
                    "status": plan.status,
                    "subject": plan.subject,
                }
                for plan in plans[:5]
            ],
        }

    def apply(self, *, password: str) -> dict[str, int | str]:
        validate_password(password)
        if AuditEvent.objects.filter(object_type="DemoDataBatch", object_id=self.batch_key).exists():
            return {"batch_key": self.batch_key, "tickets": 0, "users": 0, "already_present": 1}

        with transaction.atomic():
            queues = {name: Queue.objects.get_or_create(name=name)[0] for name in QUEUE_NAMES}
            staff_by_queue, users_created = self._ensure_staff(queues, password)
            customers, new_customers = self._ensure_customers(password)
            admins, new_admins = self._ensure_admins(password)
            users_created += new_customers + new_admins

            tickets_created = 0
            for plan in self.plans():
                self._persist_ticket(
                    plan,
                    customer=customers[plan.customer_index],
                    queues=queues,
                    staff_by_queue=staff_by_queue,
                    admins=admins,
                )
                tickets_created += 1

            AuditEvent.objects.create(
                category=AuditEvent.Category.SYSTEM,
                action="Inserted synthetic e-commerce demo dataset",
                object_type="DemoDataBatch",
                object_id=self.batch_key,
                detail={
                    "tickets": tickets_created,
                    "customers": len(customers),
                    "staff": len(STAFF_ROSTER),
                    "admins": len(ADMIN_ROSTER),
                    "seed": self.seed,
                },
            )
        return {"batch_key": self.batch_key, "tickets": tickets_created, "users": users_created, "already_present": 0}

    def _build_plans(self) -> list[TicketPlan]:
        plans: list[TicketPlan] = []
        for offset in range(self.days):
            submitted_day = self.start_date + timedelta(days=offset)
            age_days = max(0, (self.now.date() - submitted_day).days)
            for ticket_number in range(self.daily_tickets):
                queue_name = self.rng.choices(QUEUE_NAMES, weights=QUEUE_WEIGHTS, k=1)[0]
                scenario = self.rng.choice(SCENARIOS[queue_name])
                routing_kind = "none"
                status = self._choose_status(age_days)
                if status == "ROUTING_FAILED":
                    routing_kind = "staff_reroute" if self.rng.random() < 0.58 else "model_failure"
                    status = Ticket.Status.OPEN
                priority = self.rng.choices(
                    [Ticket.Priority.HIGH, Ticket.Priority.MEDIUM, Ticket.Priority.LOW], weights=[20, 55, 25], k=1
                )[0]
                if routing_kind == "model_failure":
                    priority = ""
                product = self.rng.choice(PRODUCTS)
                order = f"MY{self.rng.randint(100000, 999999)}"
                plans.append(
                    TicketPlan(
                        submitted_at=self._timestamp(submitted_day, ticket_number),
                        customer_index=self.rng.randrange(self.customer_count),
                        queue_name=queue_name,
                        priority=priority,
                        status=status,
                        routing_kind=routing_kind,
                        subject=scenario.subject.format(order=order, product=product),
                        description=scenario.description.format(order=order, product=product),
                        issue_type=scenario.issue_type,
                        model_family=self.rng.choices(["joint", "separate"], weights=[65, 35], k=1)[0],
                        queue_confidence=self._confidence(58, 96) if routing_kind != "model_failure" else None,
                        priority_confidence=self._confidence(54, 94) if routing_kind != "model_failure" else None,
                    )
                )
        return plans

    def _choose_status(self, age_days: int) -> str:
        # Synthetic records are historical operational fixtures. They must
        # never create live customer work or contribute to a model-review
        # sample, so every generated ticket is already terminal. Keep the
        # normal three-day review lifecycle represented by making recent
        # records resolved and older records closed.
        return Ticket.Status.CLOSED if age_days >= 4 else Ticket.Status.RESOLVED

    def _timestamp(self, submitted_day: date, ticket_number: int) -> datetime:
        # Tickets arrive from 08:00 to 20:59 with a repeatable but varied flow.
        hour = 8 + (ticket_number * 3 + self.rng.randrange(4)) % 13
        minute = self.rng.randrange(60)
        return timezone.make_aware(datetime.combine(submitted_day, time(hour=hour, minute=minute)))

    def _confidence(self, lower: int, upper: int) -> Decimal:
        return Decimal(f"{self.rng.uniform(lower, upper):.2f}")

    @staticmethod
    def _slug(value: str) -> str:
        return "".join(character for character in value.lower() if character.isalnum())

    def _customer_identity(self, index: int) -> tuple[str, str, str]:
        first_name, last_name = CUSTOMER_NAMES[index % len(CUSTOMER_NAMES)]
        cycle = index // len(CUSTOMER_NAMES) + 1
        email = f"{self._slug(first_name)}.{self._slug(last_name)}{cycle}@{EMAIL_DOMAINS[index % len(EMAIL_DOMAINS)]}"
        return first_name, last_name, email

    def _ensure_user(
        self,
        *,
        email: str,
        first_name: str,
        last_name: str,
        role: str,
        password: str,
    ) -> tuple[User, bool]:
        person, created = User.objects.get_or_create(
            email=email,
            defaults={
                "first_name": first_name,
                "last_name": last_name,
                "role": role,
                "is_staff": role == User.Role.ADMIN,
            },
        )
        if not created and person.role != role:
            raise ValueError(f"Existing account {email} has role {person.role}, not {role}.")
        # These accounts are local-only demo identities. Resetting the
        # password on every seed run keeps the documented demo credential
        # deterministic when an account already exists.
        person.set_password(password)
        person.save(update_fields=["password"])
        return person, created

    def _ensure_staff(self, queues: dict[str, Queue], password: str) -> tuple[dict[str, list[User]], int]:
        staff_by_queue: dict[str, list[User]] = {name: [] for name in QUEUE_NAMES}
        created_count = 0
        for first_name, last_name, email, queue_name in STAFF_ROSTER:
            person, created = self._ensure_user(
                email=email,
                first_name=first_name,
                last_name=last_name,
                role=User.Role.STAFF,
                password=password,
            )
            created_count += int(created)
            StaffAssignment.objects.update_or_create(staff=person, active=True, defaults={"queue": queues[queue_name]})
            staff_by_queue[queue_name].append(person)
        return staff_by_queue, created_count

    def _ensure_customers(self, password: str) -> tuple[list[User], int]:
        customers: list[User] = []
        created_count = 0
        for index in range(self.customer_count):
            first_name, last_name, email = self._customer_identity(index)
            person, created = self._ensure_user(
                email=email,
                first_name=first_name,
                last_name=last_name,
                role=User.Role.CUSTOMER,
                password=password,
            )
            customers.append(person)
            created_count += int(created)
        return customers, created_count

    def _ensure_admins(self, password: str) -> tuple[list[User], int]:
        admins: list[User] = []
        created_count = 0
        for first_name, last_name, email in ADMIN_ROSTER:
            person, created = self._ensure_user(
                email=email,
                first_name=first_name,
                last_name=last_name,
                role=User.Role.ADMIN,
                password=password,
            )
            admins.append(person)
            created_count += int(created)
        return admins, created_count

    def _persist_ticket(
        self,
        plan: TicketPlan,
        *,
        customer: User,
        queues: dict[str, Queue],
        staff_by_queue: dict[str, list[User]],
        admins: list[User],
    ) -> Ticket:
        queue = queues[plan.queue_name]
        routing_failed = plan.routing_kind != "none"
        assignee = None
        if not routing_failed and plan.status not in {Ticket.Status.OPEN}:
            assignee = self.rng.choice(staff_by_queue[plan.queue_name])
        if plan.routing_kind == "staff_reroute":
            initial_assignee = self.rng.choice(staff_by_queue[plan.queue_name])
        else:
            initial_assignee = assignee

        fields = self._timeline_fields(plan, assignee=assignee, now=self.now)
        if fields["resolution_source"] == Ticket.ResolutionSource.ADMIN_FORCE_CLOSE:
            fields["closed_by"] = admins[0]
        ticket = Ticket.objects.create(
            customer=customer,
            subject=plan.subject,
            description=plan.description,
            issue_type=plan.issue_type,
            status=plan.status,
            queue=None if plan.routing_kind == "model_failure" else queue,
            priority=plan.priority,
            assigned_to=assignee,
            routing_failed=routing_failed,
            routing_failure_reason=self._routing_reason(plan),
            model_family=plan.model_family,
            model_version=f"{DEMO_MODEL_VERSION_PREFIX}2026.08",
            predicted_queue="" if plan.routing_kind == "model_failure" else queue.name,
            predicted_priority=plan.priority,
            queue_confidence_percent=plan.queue_confidence,
            priority_confidence_percent=plan.priority_confidence,
            confidence_method="synthetic_demo_probability" if plan.routing_kind != "model_failure" else "unavailable",
            **fields,
        )
        Ticket.objects.filter(pk=ticket.pk).update(created_at=plan.submitted_at, updated_at=fields["updated_at"])
        ticket.refresh_from_db()

        self._create_message(ticket, customer, plan.description, plan.submitted_at)
        if fields["first_staff_reply_at"] and initial_assignee:
            self._create_message(
                ticket,
                initial_assignee,
                self._staff_reply(plan.queue_name),
                fields["first_staff_reply_at"],
            )
        if plan.status in {Ticket.Status.REOPENED, Ticket.Status.WAITING_FOR_SUPPORT} and fields["last_customer_reply_at"]:
            self._create_message(
                ticket,
                customer,
                "I am following up because I still need help with this order. Please review the issue and advise on the next step.",
                fields["last_customer_reply_at"],
            )

        if plan.routing_kind != "model_failure":
            prediction = PredictionRecord.objects.create(
                ticket=ticket,
                model_family=plan.model_family,
                model_version=ticket.model_version,
                predicted_queue=queue.name,
                predicted_priority=plan.priority,
                queue_confidence_percent=plan.queue_confidence,
                priority_confidence_percent=plan.priority_confidence,
                confidence_method="synthetic_demo_probability",
            )
            PredictionRecord.objects.filter(pk=prediction.pk).update(created_at=plan.submitted_at)
        if plan.routing_kind == "staff_reroute" and initial_assignee:
            request = RerouteRequest.objects.create(
                ticket=ticket,
                requested_by=initial_assignee,
                reason="The request concerns a different support area and requires an administrator route review.",
                previous_queue=queue.name,
                previous_assignee=initial_assignee.get_full_name(),
            )
            RerouteRequest.objects.filter(pk=request.pk).update(created_at=fields["updated_at"])
            self._create_audit(
                category=AuditEvent.Category.ROUTING,
                action="Synthetic staff reroute request",
                ticket=ticket,
                actor=initial_assignee,
                when=fields["updated_at"],
            )
        elif plan.routing_kind == "model_failure":
            self._create_audit(
                category=AuditEvent.Category.ROUTING,
                action="Synthetic routing failure",
                ticket=ticket,
                actor=None,
                when=fields["updated_at"],
            )
        elif ticket.resolution_source == Ticket.ResolutionSource.ADMIN_FORCE_CLOSE:
            self._create_audit(
                category=AuditEvent.Category.TICKET,
                action="Synthetic administrator force close",
                ticket=ticket,
                actor=admins[0],
                when=fields["closed_at"],
            )
        return ticket

    def _timeline_fields(self, plan: TicketPlan, *, assignee: User | None, now: datetime) -> dict[str, object]:
        priority = plan.priority or Ticket.Priority.MEDIUM
        targets = targets_for(priority)
        first_due = plan.submitted_at + timedelta(hours=targets["first_reply_hours"])
        resolution_due = plan.submitted_at + timedelta(hours=targets["resolution_hours"])
        fields: dict[str, object] = {
            "submitted_at": plan.submitted_at,
            "first_reply_due_at": first_due,
            "resolution_due_at": resolution_due,
            "resolution_clock_started_at": plan.submitted_at,
            "resolution_elapsed_seconds": 0,
            "first_staff_reply_at": None,
            "last_customer_reply_at": None,
            "waiting_for_customer_since": None,
            "resolved_at": None,
            "customer_review_until": None,
            "closed_at": None,
            "resolution_source": "",
            "force_close_reason": "",
            "closed_by": None,
            "first_reply_sla_met": None,
            "resolution_sla_met": None,
            "updated_at": plan.submitted_at,
        }
        if plan.routing_kind != "none" or plan.status == Ticket.Status.OPEN:
            return fields

        first_reply = plan.submitted_at + self._reply_delay(targets["first_reply_hours"])
        fields["first_staff_reply_at"] = first_reply
        fields["first_reply_sla_met"] = first_reply <= first_due

        if plan.status == Ticket.Status.WAITING_FOR_SUPPORT:
            fields["first_staff_reply_at"] = None
            fields["first_reply_sla_met"] = None
            last_customer_reply = min(now - timedelta(minutes=self.rng.randint(10, 360)), now)
            fields["last_customer_reply_at"] = last_customer_reply
            fields["updated_at"] = last_customer_reply
            return fields

        if plan.status == Ticket.Status.WAITING_FOR_CUSTOMER:
            waiting_since = max(first_reply, now - timedelta(hours=self.rng.randint(2, 20)))
            fields["waiting_for_customer_since"] = waiting_since
            fields["resolution_clock_started_at"] = None
            fields["resolution_elapsed_seconds"] = max(60, int((first_reply - plan.submitted_at).total_seconds()))
            fields["updated_at"] = waiting_since
            return fields

        if plan.status == Ticket.Status.REOPENED:
            reopened_at = max(first_reply + timedelta(minutes=15), now - timedelta(hours=self.rng.randint(1, 72)))
            fields["last_customer_reply_at"] = reopened_at
            fields["resolution_clock_started_at"] = reopened_at
            fields["resolution_elapsed_seconds"] = self.rng.randint(900, 7200)
            fields["updated_at"] = reopened_at
            return fields

        resolution_seconds = int(targets["resolution_hours"] * 3600 * self.rng.uniform(0.35, 1.3))
        resolved_at = first_reply + timedelta(seconds=resolution_seconds)
        if plan.status == Ticket.Status.RESOLVED:
            resolved_at = max(resolved_at, now - timedelta(hours=self.rng.randint(2, 60)))
            fields.update(
                {
                    "resolution_clock_started_at": None,
                    "resolution_elapsed_seconds": resolution_seconds,
                    "resolved_at": resolved_at,
                    "customer_review_until": resolved_at + timedelta(days=3),
                    "resolution_source": Ticket.ResolutionSource.CUSTOMER,
                    "resolution_sla_met": resolution_seconds <= targets["resolution_hours"] * 3600,
                    "updated_at": resolved_at,
                }
            )
            return fields

        # CLOSED is used only for tickets at least four days old, but cap the
        # synthetic close timestamp so it never ends up in the future.
        closed_at = min(resolved_at + timedelta(days=3, hours=self.rng.randint(1, 18)), now - timedelta(minutes=self.rng.randint(5, 120)))
        force_closed = self.rng.random() < 0.025
        fields.update(
            {
                "resolution_clock_started_at": None,
                "resolution_elapsed_seconds": resolution_seconds,
                "resolved_at": resolved_at,
                "customer_review_until": None,
                "closed_at": closed_at,
                "resolution_source": Ticket.ResolutionSource.ADMIN_FORCE_CLOSE if force_closed else Ticket.ResolutionSource.SYSTEM,
                "resolution_sla_met": resolution_seconds <= targets["resolution_hours"] * 3600,
                "force_close_reason": "Duplicate order issue was confirmed resolved by the administrator." if force_closed else "Customer did not reopen the resolved ticket within 3 days.",
                "closed_by": None,
                "updated_at": closed_at,
            }
        )
        return fields

    def _reply_delay(self, target_hours: int) -> timedelta:
        target_minutes = target_hours * 60
        if self.rng.random() < 0.14:
            return timedelta(minutes=target_minutes + self.rng.randint(15, target_minutes + 90))
        return timedelta(minutes=self.rng.randint(5, max(6, int(target_minutes * 0.82))))

    @staticmethod
    def _staff_reply(queue_name: str) -> str:
        replies = {
            "Technical Support": "We are checking the account and platform logs. Please confirm whether the issue appears on another device.",
            "Product Support": "We are reviewing the item details and the seller listing. We will update you after the comparison is complete.",
            "Customer Service": "We have reviewed the order record and will confirm the next available delivery or account update.",
            "Billing and Payments": "We are checking the payment reference with our billing provider and will update you once the transaction is verified.",
            "Returns and Exchanges": "We are checking the return request and will share the available collection or exchange arrangement.",
            "Service Outages and Maintenance": "Our technical team is reviewing the affected service. We will share an update once the incident status is confirmed.",
            "Sales and Pre-Sales": "Thank you for your interest. We are preparing the relevant plan and availability details for you.",
            "Human Resources": "We have received your enquiry and will check the application record with the recruitment team.",
            "General Inquiry": "Thank you for contacting us. We are reviewing your question and will send the most relevant information shortly.",
        }
        return replies[queue_name]

    @staticmethod
    def _routing_reason(plan: TicketPlan) -> str:
        if plan.routing_kind == "model_failure":
            return "Synthetic model routing failure for administration-flow testing."
        if plan.routing_kind == "staff_reroute":
            return "Synthetic staff reroute request awaiting administrator review."
        return ""

    @staticmethod
    def _create_message(ticket: Ticket, author: User, body: str, when: datetime | None) -> None:
        message = TicketMessage.objects.create(ticket=ticket, author=author, body=body)
        if when:
            TicketMessage.objects.filter(pk=message.pk).update(created_at=when)

    @staticmethod
    def _create_audit(*, category: str, action: str, ticket: Ticket, actor: User | None, when: datetime | None) -> None:
        event = AuditEvent.objects.create(
            actor=actor,
            category=category,
            action=action,
            object_type="Ticket",
            object_id=str(ticket.pk),
            detail={"reference": ticket.reference, "synthetic": True},
        )
        if when:
            AuditEvent.objects.filter(pk=event.pk).update(created_at=when)
