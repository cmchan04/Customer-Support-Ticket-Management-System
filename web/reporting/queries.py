"""Read-only dashboard queries with role visibility enforced in one seam."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime, timedelta

from django.db.models import Case, IntegerField, Prefetch, Q, QuerySet, Value, When
from django.utils import timezone

from web.accounts.models import User
from web.tickets.models import RerouteRequest, StaffAssignment, Ticket
from web.tickets.sla import sla_snapshot

ACTIVE_STATUSES = {
    Ticket.Status.OPEN,
    Ticket.Status.WAITING_FOR_SUPPORT,
    Ticket.Status.WAITING_FOR_CUSTOMER,
    Ticket.Status.RESOLVED,
    Ticket.Status.REOPENED,
}

DEFAULT_PAGE_SIZE = 10
PREVIEW_SIZE = 5
MAX_PAGE_SIZE = 50


def _page_number(value: int | str | None, default: int = 1) -> int:
    try:
        return max(1, int(value or default))
    except (TypeError, ValueError):
        return default


def _page_size(value: int | str | None, default: int = DEFAULT_PAGE_SIZE) -> int:
    try:
        return min(MAX_PAGE_SIZE, max(1, int(value or default)))
    except (TypeError, ValueError):
        return default


def period_bounds(period: str, now: datetime | None = None) -> tuple[datetime, datetime]:
    now = now or timezone.now()
    period = period.lower()
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "week":
        start -= timedelta(days=start.weekday())
    elif period == "month":
        start = start.replace(day=1)
    elif period == "quarter":
        start = start.replace(month=((start.month - 1) // 3) * 3 + 1, day=1)
    elif period == "year":
        start = start.replace(month=1, day=1)
    elif period != "day":
        raise ValueError("Period must be day, week, month, quarter, or year.")
    if period == "day":
        end = start + timedelta(days=1)
    elif period == "week":
        end = start + timedelta(days=7)
    elif period == "month":
        end = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
    elif period == "quarter":
        end_month = start.month + 3
        end = start.replace(year=start.year + (end_month - 1) // 12, month=(end_month - 1) % 12 + 1)
    else:
        end = start.replace(year=start.year + 1)
    return start, end


class DashboardQueries:
    """Deep read interface for the customer, staff, and admin dashboards."""

    @staticmethod
    def _visible_active(queryset: QuerySet[Ticket]) -> QuerySet[Ticket]:
        # Drafts are private composition state, not operational backlog. The
        # queue dashboards therefore count only submitted tickets in the five
        # active workflow states; the customer dashboard exposes drafts via
        # its dedicated ``draft_count`` field and Admin can still see them in
        # the complete ticket-management list.
        return queryset.filter(status__in=ACTIVE_STATUSES)

    @staticmethod
    def _ticket_queryset(queryset: QuerySet[Ticket]) -> QuerySet[Ticket]:
        """Add the related objects needed by ticket rows in one database pass."""
        reroutes = RerouteRequest.objects.select_related("requested_by", "resolved_by")
        return queryset.select_related("queue", "customer", "assigned_to").prefetch_related(
            "predictions",
            Prefetch("reroute_requests", queryset=reroutes),
        )

    @staticmethod
    def _paginate_queryset(queryset: QuerySet[Ticket], page: int | None, page_size: int = DEFAULT_PAGE_SIZE) -> tuple[list[Ticket], dict[str, int]]:
        total = queryset.count()
        if page is None:
            return list(queryset), {"page": 1, "page_size": total or page_size, "total": total, "total_pages": max(1, (total + page_size - 1) // page_size)}
        page_size = _page_size(page_size)
        total_pages = max(1, (total + page_size - 1) // page_size)
        page = min(_page_number(page), total_pages)
        start = (page - 1) * page_size
        return list(queryset[start : start + page_size]), {"page": page, "page_size": page_size, "total": total, "total_pages": total_pages}

    @staticmethod
    def _paginate_rows(rows: list[Ticket], page: int | None, page_size: int = DEFAULT_PAGE_SIZE) -> tuple[list[Ticket], dict[str, int]]:
        total = len(rows)
        page_size = _page_size(page_size)
        total_pages = max(1, (total + page_size - 1) // page_size)
        if page is None:
            return rows, {"page": 1, "page_size": total or page_size, "total": total, "total_pages": total_pages}
        page = min(_page_number(page), total_pages)
        start = (page - 1) * page_size
        return rows[start : start + page_size], {"page": page, "page_size": page_size, "total": total, "total_pages": total_pages}

    @staticmethod
    def _search_tickets(queryset: QuerySet[Ticket], search: str = "") -> QuerySet[Ticket]:
        search = str(search or "").strip()
        if not search:
            return queryset
        query = (
            Q(subject__icontains=search)
            | Q(description__icontains=search)
            | Q(issue_type__icontains=search)
            | Q(model_family__icontains=search)
            | Q(model_version__icontains=search)
            | Q(predicted_queue__icontains=search)
            | Q(predicted_priority__icontains=search)
            | Q(customer__first_name__icontains=search)
            | Q(customer__last_name__icontains=search)
            | Q(customer__email__icontains=search)
            | Q(queue__name__icontains=search)
            | Q(assigned_to__first_name__icontains=search)
            | Q(assigned_to__last_name__icontains=search)
            | Q(assigned_to__email__icontains=search)
            | Q(status__icontains=search)
            | Q(priority__icontains=search)
        )
        digits = "".join(character for character in search if character.isdigit())
        if digits:
            query |= Q(pk=int(digits))
        return queryset.filter(query)

    @staticmethod
    def _priority_order(queryset: QuerySet[Ticket]) -> QuerySet[Ticket]:
        return queryset.annotate(
            _priority_rank=Case(
                When(priority=Ticket.Priority.HIGH, then=Value(3)),
                When(priority=Ticket.Priority.MEDIUM, then=Value(2)),
                When(priority=Ticket.Priority.LOW, then=Value(1)),
                default=Value(0),
                output_field=IntegerField(),
            )
        )

    @classmethod
    def _sort_tickets(cls, queryset: QuerySet[Ticket], key: str = "updated", direction: str = "desc") -> QuerySet[Ticket]:
        key = str(key or "updated")
        direction = "asc" if str(direction).lower() == "asc" else "desc"
        fields = {
            "ticketId": "pk",
            "reference": "pk",
            "model": "model_family",
            "type": "issue_type",
            "queue": "queue__name",
            "priority": "_priority_rank",
            "status": "status",
            "assignee": "assigned_to__last_name",
            "createdAt": "created_at",
            "lastUpdated": "updated_at",
            "updated": "updated_at",
            "attention": "_attention_rank",
        }
        if key == "priority":
            queryset = cls._priority_order(queryset)
        if key == "attention":
            now = timezone.now()
            queryset = queryset.annotate(
                _attention_rank=Case(
                    When(routing_failed=True, then=Value(2)),
                    When(first_reply_due_at__lt=now, then=Value(1)),
                    When(resolution_due_at__lt=now, then=Value(1)),
                    default=Value(0),
                    output_field=IntegerField(),
                )
            )
        field = fields.get(key, "updated_at")
        prefix = "" if direction == "asc" else "-"
        return queryset.order_by(f"{prefix}{field}", f"{prefix}pk")

    @staticmethod
    def _status_filter(queryset: QuerySet[Ticket], value: str) -> QuerySet[Ticket]:
        value = str(value or "all")
        if value == "all":
            return queryset
        if value == "In progress":
            return queryset.filter(status__in={Ticket.Status.WAITING_FOR_SUPPORT, Ticket.Status.WAITING_FOR_CUSTOMER})
        labels = {
            "Open": Ticket.Status.OPEN,
            "Waiting for Support": Ticket.Status.WAITING_FOR_SUPPORT,
            "Waiting for Customer": Ticket.Status.WAITING_FOR_CUSTOMER,
            "Resolved": Ticket.Status.RESOLVED,
            "Reopened": Ticket.Status.REOPENED,
            "Closed": Ticket.Status.CLOSED,
        }
        return queryset.filter(status=labels.get(value, value))

    @classmethod
    def _filter_tickets(cls, queryset: QuerySet[Ticket], *, search: str = "", model: str = "all", issue_type: str = "all", queue: str = "all", priority: str = "all", status: str = "all", assignee: str = "all") -> QuerySet[Ticket]:
        queryset = cls._search_tickets(queryset, search)
        if model != "all":
            queryset = queryset.filter(model_family=str(model).lower())
        if issue_type != "all":
            queryset = queryset.filter(issue_type=issue_type)
        if queue != "all":
            if queue == "Routing failed":
                queryset = queryset.filter(routing_failed=True)
            elif queue == "Unassigned":
                queryset = queryset.filter(queue__isnull=True, routing_failed=False)
            else:
                queryset = queryset.filter(queue__name=queue)
        if priority != "all":
            priority_value = {"High": Ticket.Priority.HIGH, "Medium": Ticket.Priority.MEDIUM, "Low": Ticket.Priority.LOW, "Unclassified": ""}.get(priority, str(priority).lower())
            queryset = queryset.filter(priority=priority_value)
        queryset = cls._status_filter(queryset, status)
        if assignee != "all":
            if assignee == "Unassigned":
                queryset = queryset.filter(assigned_to__isnull=True)
            else:
                queryset = queryset.filter(Q(assigned_to__first_name__icontains=assignee) | Q(assigned_to__last_name__icontains=assignee))
        return queryset

    @staticmethod
    def _overdue_ids(queryset: QuerySet[Ticket]) -> set[int]:
        now = timezone.now()
        candidates = queryset.filter(
            Q(first_staff_reply_at__isnull=True, first_reply_due_at__lt=now)
            | Q(resolution_due_at__lt=now)
        )
        return {ticket.pk for ticket in candidates if DashboardQueries._is_overdue(ticket)}

    @staticmethod
    def _ticket_summary(ticket: Ticket) -> dict[str, object]:
        snapshot = sla_snapshot(ticket)
        overdue = bool(snapshot["first_reply_breached"] or snapshot["resolution_breached"])
        return {
            "id": ticket.pk,
            "reference": ticket.reference,
            "subject": ticket.subject,
            "description": ticket.description,
            "customer": ticket.customer.get_full_name() if ticket.customer_id else "",
            "type": ticket.issue_type,
            "queue": ticket.queue.name if ticket.queue_id else "",
            "priority": ticket.priority,
            "status": ticket.status,
            "admin_status": ticket.admin_status_label,
            "assignee": ticket.assigned_to.get_full_name() if ticket.assigned_to_id else "",
            "model_family": ticket.model_family,
            "model_version": ticket.model_version,
            "predicted_queue": ticket.predicted_queue,
            "predicted_priority": ticket.predicted_priority,
            "routing_failed": ticket.routing_failed,
            "routing_failure_reason": ticket.routing_failure_reason,
            "overdue": overdue,
            "overdue_label": "First reply overdue" if snapshot["first_reply_breached"] else "Resolution SLA overdue" if snapshot["resolution_breached"] else "",
            "force_close_reason": ticket.force_close_reason,
            "resolution_source": ticket.resolution_source,
            "closed_at": ticket.closed_at.isoformat() if ticket.closed_at else None,
            "customer_review_until": ticket.customer_review_until.isoformat() if ticket.customer_review_until else None,
            "updated_at": ticket.updated_at.isoformat() if ticket.updated_at else None,
            "created_at": ticket.created_at.isoformat() if ticket.created_at else None,
            "queue_confidence_percent": float(ticket.queue_confidence_percent) if ticket.queue_confidence_percent is not None else None,
            "priority_confidence_percent": float(ticket.priority_confidence_percent) if ticket.priority_confidence_percent is not None else None,
            "previous_predictions": [
                {
                    "model_family": prediction.model_family,
                    "model_version": prediction.model_version,
                    "queue": prediction.predicted_queue,
                    "priority": prediction.predicted_priority,
                    "queue_confidence_percent": float(prediction.queue_confidence_percent) if prediction.queue_confidence_percent is not None else None,
                    "priority_confidence_percent": float(prediction.priority_confidence_percent) if prediction.priority_confidence_percent is not None else None,
                    "created_at": prediction.created_at.isoformat(),
                }
                for prediction in ticket.predictions.all()
            ],
            "reroute_requests": [
                {
                    "reason": request.reason,
                    "status": request.status,
                    "requested_by": request.requested_by.get_full_name(),
                    "previous_queue": request.previous_queue,
                    "previous_assignee": request.previous_assignee,
                    "created_at": request.created_at.isoformat(),
                }
                for request in ticket.reroute_requests.all()
            ],
        }

    def customer_dashboard(self, customer: User, *, page: int | None = None, page_size: int = DEFAULT_PAGE_SIZE) -> dict[str, object]:
        tickets = self._visible_active(self._ticket_queryset(Ticket.objects.filter(customer=customer)))
        drafts = self._ticket_queryset(Ticket.objects.filter(customer=customer, status=Ticket.Status.DRAFT))
        ordered = tickets.order_by("-updated_at", "-pk")
        draft_count = drafts.count()
        if page is None:
            rows, pagination = self._paginate_queryset(ordered, page, page_size)
        else:
            page_size = _page_size(page_size)
            combined_total = ordered.count() + draft_count
            total_pages = max(1, (combined_total + page_size - 1) // page_size)
            current_page = min(_page_number(page), total_pages)
            active_offset = max(0, (current_page - 1) * page_size - draft_count)
            active_limit = max(0, page_size - draft_count) if current_page == 1 else page_size
            rows = list(ordered[active_offset : active_offset + active_limit]) if active_limit else []
            pagination = {"page": current_page, "page_size": page_size, "total": combined_total, "total_pages": total_pages}
        preview_rows = list(ordered[:PREVIEW_SIZE])
        reply_preview = list(tickets.filter(status=Ticket.Status.WAITING_FOR_CUSTOMER).order_by("-updated_at", "-pk")[:1])
        return {
            "active_count": tickets.count(),
            "reply_needed_count": tickets.filter(status=Ticket.Status.WAITING_FOR_CUSTOMER).count(),
            "draft_count": draft_count,
            "tickets": [self._ticket_summary(ticket) for ticket in rows],
            "preview_tickets": [self._ticket_summary(ticket) for ticket in preview_rows],
            "reply_preview": [self._ticket_summary(ticket) for ticket in reply_preview],
            "tickets_pagination": pagination,
            "drafts": [self._ticket_summary(ticket) for ticket in drafts.order_by("-updated_at", "-pk")],
        }

    def staff_dashboard(
        self,
        staff: User,
        *,
        ticket_pool_page: int | None = None,
        my_tickets_page: int | None = None,
        page_size: int = DEFAULT_PAGE_SIZE,
        pool_priority: str = "all",
        pool_type: str = "all",
        pool_search: str = "",
        pool_sort: str = "createdAt",
        pool_direction: str = "desc",
        my_priority: str = "all",
        my_status: str = "all",
        my_search: str = "",
        my_sort: str = "lastUpdated",
        my_direction: str = "desc",
        resolved_period: str = "today",
    ) -> dict[str, object]:
        assignment = StaffAssignment.objects.filter(staff=staff, active=True).select_related("queue").first()
        queue = assignment.queue if assignment else None
        assigned = self._visible_active(self._ticket_queryset(Ticket.objects.filter(assigned_to=staff)))
        pool = self._visible_active(self._ticket_queryset(Ticket.objects.filter(queue=queue, status=Ticket.Status.OPEN, assigned_to__isnull=True, routing_failed=False))) if queue else Ticket.objects.none()
        filtered_pool = self._filter_tickets(
            pool,
            search=pool_search,
            priority=pool_priority,
            issue_type=pool_type,
        )
        filtered_assigned = self._filter_tickets(
            assigned,
            search=my_search,
            priority=my_priority,
            status=my_status,
        )
        pool_rows, pool_pagination = self._paginate_queryset(self._sort_tickets(filtered_pool, pool_sort, pool_direction), ticket_pool_page, page_size)
        assigned_rows, assigned_pagination = self._paginate_queryset(self._sort_tickets(filtered_assigned, my_sort, my_direction), my_tickets_page, page_size)
        preview_rows = list(assigned.order_by("-updated_at", "-pk")[:PREVIEW_SIZE])
        overdue = [ticket for ticket in assigned if self._is_overdue(ticket)]
        resolved_period = str(resolved_period or "today").lower()
        resolved_bounds_period = "day" if resolved_period == "today" else resolved_period
        try:
            resolved_start, resolved_end = period_bounds(resolved_bounds_period)
        except ValueError:
            resolved_period = "today"
            resolved_start, resolved_end = period_bounds("day")
        resolved_period_count = assigned.filter(
            status__in={Ticket.Status.RESOLVED, Ticket.Status.CLOSED},
            resolved_at__gte=resolved_start,
            resolved_at__lt=resolved_end,
        ).count()
        return {
            "staff": {"id": staff.pk, "name": staff.get_full_name(), "queue": queue.name if queue else ""},
            "queue": {
                "name": queue.name if queue else "",
                "backlog": self._visible_active(Ticket.objects.filter(queue=queue)).count() if queue else 0,
                "unassigned": pool.count(),
                "high_priority": pool.filter(priority=Ticket.Priority.HIGH).count(),
            },
            "metrics": {
                "active_tickets": assigned.filter(status__in={Ticket.Status.WAITING_FOR_SUPPORT, Ticket.Status.WAITING_FOR_CUSTOMER, Ticket.Status.REOPENED}).count(),
                "waiting_for_reply": assigned.filter(status=Ticket.Status.WAITING_FOR_SUPPORT).count(),
                "pending_closure": assigned.filter(status=Ticket.Status.RESOLVED).count(),
                "overdue": len(overdue),
            },
            "resolved_period": resolved_period,
            "resolved_period_count": resolved_period_count,
            "tickets": [self._ticket_summary(ticket) for ticket in assigned_rows],
            "preview_tickets": [self._ticket_summary(ticket) for ticket in preview_rows],
            "ticket_pool": [self._ticket_summary(ticket) for ticket in pool_rows],
            "tickets_pagination": assigned_pagination,
            "ticket_pool_pagination": pool_pagination,
        }

    def staff_performance(self, staff: User, page: int = 1, page_size: int = 5, period: str = "month") -> dict[str, object]:
        # Closed tickets are intentionally not returned to Staff. The
        # Closed work is visible as a read-only performance record. The ticket
        # detail endpoint still keeps closed conversations hidden from staff.
        all_resolved = Ticket.objects.filter(assigned_to=staff, status__in={Ticket.Status.RESOLVED, Ticket.Status.CLOSED})
        reviewable = Ticket.objects.filter(assigned_to=staff, status__in={Ticket.Status.RESOLVED, Ticket.Status.CLOSED}).select_related("customer", "queue").prefetch_related("predictions")
        start = max(0, (page - 1) * page_size)
        rows = list(reviewable.order_by("-resolved_at")[start : start + page_size])
        period_start, period_end = period_bounds(period)
        period_resolved = all_resolved.filter(resolved_at__gte=period_start, resolved_at__lt=period_end)
        period_rows = list(period_resolved)
        return {
            "page": page,
            "page_size": page_size,
            "total": reviewable.count(),
            "recent_resolved_work": [self._ticket_summary(ticket) for ticket in rows],
            "closed_count": all_resolved.filter(status=Ticket.Status.CLOSED).count(),
            "sla": self._sla_summary(all_resolved),
            "period": period,
            "period_resolved_count": len(period_rows),
            "period_sla": self._sla_summary(period_rows),
        }

    def admin_overview(self, period: str = "day", *, overdue_period: str | None = None, attention_page: int | None = None, page_size: int = PREVIEW_SIZE) -> dict[str, object]:
        start, end = period_bounds(period)
        overdue_period = overdue_period or period
        overdue_start, overdue_end = period_bounds(overdue_period)
        submitted = Ticket.objects.filter(submitted_at__gte=start, submitted_at__lt=end).select_related("queue")
        all_tickets = Ticket.objects.all()
        active_tickets = self._visible_active(all_tickets)
        overdue_ids = self._overdue_ids(active_tickets)
        overdue_candidates = list(Ticket.objects.filter(submitted_at__gte=overdue_start, submitted_at__lt=overdue_end).select_related("queue"))
        overdue_in_period = [ticket for ticket in overdue_candidates if self._is_period_overdue(ticket)]
        attention_queryset = self._ticket_queryset(active_tickets.filter(Q(routing_failed=True) | Q(pk__in=overdue_ids))).order_by("-updated_at", "-pk")
        attention_rows, attention_pagination = self._paginate_queryset(attention_queryset, attention_page, page_size)
        return {
            "period": period,
            "overdue_period": overdue_period,
            "tickets_processed": submitted.count(),
            "open_backlog": active_tickets.count(),
            "high_priority": active_tickets.filter(priority=Ticket.Priority.HIGH).count(),
            "route_corrections": RerouteRequest.objects.filter(status=RerouteRequest.Status.RESOLVED, resolved_at__gte=start, resolved_at__lt=end).count(),
            "routing_failures": active_tickets.filter(routing_failed=True).count(),
            "overdue": len(overdue_ids),
            "sla_breaches_by_queue": self._sla_breaches_by_queue(overdue_in_period),
            "tickets_requiring_attention": [self._ticket_summary(ticket) for ticket in attention_rows],
            "attention_pagination": attention_pagination,
            "attention_total": attention_pagination["total"],
            "queues": self._queue_distribution(submitted),
            "priorities": self._priority_distribution(submitted),
            "all_tickets_count": all_tickets.count(),
        }

    def admin_ticket_management(
        self,
        include_closed: bool = True,
        *,
        page: int | None = None,
        attention_page: int | None = None,
        page_size: int = DEFAULT_PAGE_SIZE,
        search: str = "",
        model: str = "all",
        issue_type: str = "all",
        queue: str = "all",
        priority: str = "all",
        status: str = "all",
        assignee: str = "all",
        sort: str = "updated",
        direction: str = "desc",
    ) -> dict[str, object]:
        tickets = Ticket.objects.all() if include_closed else self._visible_active(Ticket.objects.all())
        all_source_count = tickets.count()
        active_tickets = self._visible_active(tickets)
        overdue_ids = self._overdue_ids(active_tickets)
        filtered = self._filter_tickets(
            tickets,
            search=search,
            model=model,
            issue_type=issue_type,
            queue=queue,
            priority=priority,
            status=status,
            assignee=assignee,
        )
        ordered = self._sort_tickets(filtered, sort, direction)
        rows, all_pagination = self._paginate_queryset(self._ticket_queryset(ordered), page, page_size)
        attention_filtered = filtered.filter(
            status__in=ACTIVE_STATUSES,
        ).filter(Q(routing_failed=True) | Q(pk__in=overdue_ids))
        attention_ordered = self._sort_tickets(attention_filtered, sort, direction)
        attention_rows, attention_pagination = self._paginate_queryset(self._ticket_queryset(attention_ordered), attention_page, page_size)
        queue_values = set(tickets.exclude(queue__isnull=True).values_list("queue__name", flat=True))
        queue_values.update({"Routing failed", "Unassigned"})
        assignee_values = set(
            name for name in tickets.filter(assigned_to__isnull=False).values_list("assigned_to__first_name", "assigned_to__last_name")
            for name in [" ".join(part for part in name if part).strip()]
            if name
        )
        assignee_values.add("Unassigned")
        return {
            "attention": [self._ticket_summary(ticket) for ticket in attention_rows],
            "all_tickets": [self._ticket_summary(ticket) for ticket in rows],
            "closed_visible_to_admin": include_closed,
            "attention_pagination": attention_pagination,
            "all_pagination": all_pagination,
            "attention_total": attention_pagination["total"],
            "all_tickets_count": all_source_count,
            "filtered_all_count": all_pagination["total"],
            "filtered_attention_count": attention_pagination["total"],
            "filter_options": {"queues": sorted(queue_values), "assignees": sorted(assignee_values)},
        }

    @staticmethod
    def _is_overdue(ticket: Ticket) -> bool:
        snapshot = sla_snapshot(ticket)
        return bool(snapshot["first_reply_breached"] or snapshot["resolution_breached"])

    @staticmethod
    def _is_period_overdue(ticket: Ticket) -> bool:
        """Count a historical SLA breach even after the ticket was closed."""
        if ticket.status == Ticket.Status.CLOSED:
            return ticket.first_reply_sla_met is False or ticket.resolution_sla_met is False
        return DashboardQueries._is_overdue(ticket)

    @staticmethod
    def _sla_summary(tickets: Iterable[Ticket]) -> dict[str, object]:
        rows = list(tickets)
        met = [ticket for ticket in rows if sla_snapshot(ticket)["overall_met"]]
        return {"resolved_or_closed": len(rows), "overall_sla_met": round(len(met) / len(rows) * 100, 2) if rows else None}

    @staticmethod
    def _sla_breaches_by_queue(tickets: Iterable[Ticket]) -> list[dict[str, object]]:
        counts: dict[str, int] = {}
        for ticket in tickets:
            name = ticket.queue.name if ticket.queue_id else "Routing failed"
            counts[name] = counts.get(name, 0) + 1
        return [{"queue": name, "overdue": count} for name, count in sorted(counts.items())]

    @staticmethod
    def _queue_distribution(tickets: Iterable[Ticket]) -> list[dict[str, object]]:
        counts: dict[str, int] = {}
        for ticket in tickets:
            name = ticket.queue.name if ticket.queue_id else "Routing failed"
            counts[name] = counts.get(name, 0) + 1
        return [{"queue": name, "count": count} for name, count in sorted(counts.items())]

    @staticmethod
    def _priority_distribution(tickets: Iterable[Ticket]) -> list[dict[str, object]]:
        counts: dict[str, int] = {}
        for ticket in tickets:
            name = ticket.priority or "Unclassified"
            counts[name] = counts.get(name, 0) + 1
        return [{"priority": name, "count": count} for name, count in sorted(counts.items())]
