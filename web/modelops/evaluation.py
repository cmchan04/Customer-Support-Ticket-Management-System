"""Live model evaluation from tickets that reached a reviewed closed state.

Training/holdout scores describe the original experiment.  The live scores in
the model centre intentionally use the ticket's immutable prediction fields
and the final queue/priority selected before closure.  A reroute or priority
edit therefore changes the reviewed outcome without overwriting the original
model evidence.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime

from django.db.models import QuerySet

from web.tickets.models import Ticket


def _macro_f1(actual: list[str], predicted: list[str]) -> float | None:
    if not actual:
        return None
    labels = sorted(set(actual) | set(predicted))
    scores: list[float] = []
    for label in labels:
        true_positive = sum(a == label and p == label for a, p in zip(actual, predicted))
        false_positive = sum(a != label and p == label for a, p in zip(actual, predicted))
        false_negative = sum(a == label and p != label for a, p in zip(actual, predicted))
        precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 0.0
        recall = true_positive / (true_positive + false_negative) if true_positive + false_negative else 0.0
        scores.append(2 * precision * recall / (precision + recall) if precision + recall else 0.0)
    return sum(scores) / len(scores) if scores else None


def _accuracy(actual: list[str], predicted: list[str]) -> float | None:
    if not actual:
        return None
    return sum(a == p for a, p in zip(actual, predicted)) / len(actual)


def _reviewed_tickets(family: str, *, start: datetime | None = None, end: datetime | None = None) -> QuerySet[Ticket]:
    queryset = Ticket.objects.filter(
        model_family=family,
        status=Ticket.Status.CLOSED,
    ).select_related("queue").prefetch_related("reroute_requests")
    if start is not None:
        queryset = queryset.filter(closed_at__gte=start)
    if end is not None:
        queryset = queryset.filter(closed_at__lt=end)
    return queryset


def live_model_metrics(
    family: str,
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    tickets: Iterable[Ticket] | None = None,
) -> dict[str, object]:
    """Return outcome metrics for closed tickets of one deployed model.

    Missing predictions are represented as a distinct prediction label, so a
    manually completed routing-failure ticket is not silently counted as a
    correct model prediction.
    """

    rows = list(tickets) if tickets is not None else list(_reviewed_tickets(family, start=start, end=end))
    queue_actual: list[str] = []
    queue_predicted: list[str] = []
    priority_actual: list[str] = []
    priority_predicted: list[str] = []
    for ticket in rows:
        actual_queue = ticket.queue.name if ticket.queue_id else "Unassigned"
        actual_priority = str(ticket.priority or "Unclassified").lower()
        predicted_queue = ticket.predicted_queue or "__missing_prediction__"
        predicted_priority = str(ticket.predicted_priority or "__missing_prediction__").lower()
        # A staff reroute request is a human correction signal even if an
        # administrator ultimately sends the ticket back to the original
        # queue.  Preserve that signal in the live evaluation rather than
        # treating the final value as an unreviewed match.
        if ticket.reroute_requests.exists() and actual_queue == predicted_queue:
            predicted_queue = "__manual_queue_correction__"
        queue_actual.append(actual_queue)
        queue_predicted.append(predicted_queue)
        priority_actual.append(actual_priority)
        priority_predicted.append(predicted_priority)

    queue_correct = sum(a == p for a, p in zip(queue_actual, queue_predicted))
    priority_correct = sum(a == p for a, p in zip(priority_actual, priority_predicted))
    return {
        "reviewed_count": len(rows),
        "queue_reviewed_count": len(queue_actual),
        "priority_reviewed_count": len(priority_actual),
        "queue_accuracy": _accuracy(queue_actual, queue_predicted),
        "priority_accuracy": _accuracy(priority_actual, priority_predicted),
        "queue_macro_f1": _macro_f1(queue_actual, queue_predicted),
        "priority_macro_f1": _macro_f1(priority_actual, priority_predicted),
        "queue_wrong_count": len(queue_actual) - queue_correct,
        "priority_wrong_count": len(priority_actual) - priority_correct,
    }
