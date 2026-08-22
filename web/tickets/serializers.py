"""Stable JSON representations used by the prototype replacement frontend."""

from __future__ import annotations

from .models import Ticket
from .sla import sla_snapshot


def ticket_detail(ticket: Ticket) -> dict[str, object]:
    return {
        "id": ticket.pk,
        "reference": ticket.reference,
        "subject": ticket.subject,
        "description": ticket.description,
        "customer": ticket.customer.get_full_name(),
        "customer_id": ticket.customer_id,
        "issue_type": ticket.issue_type,
        "queue": ticket.queue.name if ticket.queue_id else "",
        "priority": ticket.priority,
        "status": ticket.status,
        "admin_status": ticket.admin_status_label,
        "assignee": ticket.assigned_to.get_full_name() if ticket.assigned_to_id else "",
        "model_family": ticket.model_family,
        "model_version": ticket.model_version,
        "predicted_queue": ticket.predicted_queue,
        "predicted_priority": ticket.predicted_priority,
        "queue_confidence_percent": float(ticket.queue_confidence_percent) if ticket.queue_confidence_percent is not None else None,
        "priority_confidence_percent": float(ticket.priority_confidence_percent) if ticket.priority_confidence_percent is not None else None,
        "confidence_method": ticket.confidence_method,
        "routing_failed": ticket.routing_failed,
        "routing_failure_reason": ticket.routing_failure_reason,
        "force_close_reason": ticket.force_close_reason,
        "resolution_source": ticket.resolution_source,
        "closed_at": ticket.closed_at.isoformat() if ticket.closed_at else None,
        "customer_review_until": ticket.customer_review_until.isoformat() if ticket.customer_review_until else None,
        "created_at": ticket.created_at.isoformat(),
        "updated_at": ticket.updated_at.isoformat(),
        "sla": sla_snapshot(ticket),
        "messages": [
            {
                "id": message.pk,
                "author": message.author.get_full_name() if message.author_id else "System",
                "author_role": message.author.role if message.author_id else "SYSTEM",
                "body": message.body,
                "created_at": message.created_at.isoformat(),
            }
            for message in ticket.messages.select_related("author").all()
        ],
        "predictions": [
            {
                "model_family": prediction.model_family,
                "model_version": prediction.model_version,
                "queue": prediction.predicted_queue,
                "priority": prediction.predicted_priority,
                "queue_confidence_percent": float(prediction.queue_confidence_percent) if prediction.queue_confidence_percent is not None else None,
                "priority_confidence_percent": float(prediction.priority_confidence_percent) if prediction.priority_confidence_percent is not None else None,
                "confidence_method": prediction.confidence_method,
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
            for request in ticket.reroute_requests.select_related("requested_by").all()
        ],
    }
