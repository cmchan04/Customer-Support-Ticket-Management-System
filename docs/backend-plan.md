# Backend Plan — Solve Your Inquiries

## Summary

Build one Django 5.2 monolith using SQLite, Django templates, small JSON endpoints, the existing fixed Joint and Separate Joblib models, session authentication, and 30-second dashboard polling. Preserve the existing desktop UI while replacing prototype arrays and fake dates with database-backed data.

Do not add model retraining, rollback, Celery, Redis, WebSockets, public registration, attachments, or email notifications.

## Structure and Interfaces

Create the Django project in `web/` with `accounts`, `tickets`, `modelops`, `reporting`, and `audit` modules. Keep workflow rules out of views:

```python
TicketWorkflow.create_draft(...)
TicketWorkflow.submit(...)
TicketWorkflow.claim(...)
TicketWorkflow.reply(...)
TicketWorkflow.mark_customer_resolved(...)
TicketWorkflow.reopen(...)
TicketWorkflow.request_reroute(...)
TicketWorkflow.admin_route(...)
TicketWorkflow.force_close(...)
TicketWorkflow.auto_resolve_due_customer_replies(...)
TicketWorkflow.close_due_resolved_tickets(...)

PredictionService.predict(...)
DashboardQueries.admin_overview(...)
```

Keep the existing `TicketPredictor.predict(...)` interface. Add
`predict_scored(...)` to return the predicted queue and priority, their
confidence percentages, and the confidence method. When a calibrated SVM
artifact is available, these percentages come from a cross-validated sigmoid
probability layer fitted after model selection. Older artifacts remain valid
for labels but return unavailable confidence until retrained.

## Data and Workflow

Use an email-based custom `User` with Customer, Staff, and Admin roles. Email is fixed after account creation. Staff belong to one active queue; staff deletion deactivates their account and preserves history.

Core records are `Queue`, `Ticket`, `TicketMessage`, `PredictionRecord`, `RerouteRequest`, `AuditEvent`, and `ModelDeployment`.

### Ticket lifecycle

Use the following canonical `Ticket.status` values. Keep routing and assignment as separate fields; they must not be inferred from the visible status.

| Status | Meaning | Next transition | Visibility |
| --- | --- | --- | --- |
| `OPEN` | Customer submitted the ticket; it is routed but unassigned. | Staff claims → `WAITING_FOR_SUPPORT` | Customer, relevant Queue Ticket Pool, Admin |
| `WAITING_FOR_SUPPORT` | A staff member has claimed it and a staff reply is needed. | Staff replies → `WAITING_FOR_CUSTOMER` | Customer, assigned Staff, Admin |
| `WAITING_FOR_CUSTOMER` | Staff replied and the system awaits customer feedback. | Customer replies → `WAITING_FOR_SUPPORT`; no reply for 24 hours → `RESOLVED` | Customer, assigned Staff, Admin |
| `RESOLVED` | Customer marked the ticket resolved, or the 24-hour no-reply rule resolved it automatically. | Customer reopens within 72 hours → `REOPENED`; after 72 hours → `CLOSED` | Customer, assigned Staff, Admin |
| `REOPENED` | Customer reopened a resolved ticket and support must reply again. | Staff replies → `WAITING_FOR_CUSTOMER` | Customer, assigned Staff, Admin |
| `CLOSED` | Terminal archive state: system closed it after 72 hours in `RESOLVED`, or an Admin force closed it with a reason. | None | Admin only |

For the Admin interface only, render both `WAITING_FOR_SUPPORT` and `WAITING_FOR_CUSTOMER` as **In progress**. Keep their canonical values in the database and audit trail so workload and SLA logic remains accurate.

`OPEN` through `REOPENED` are active backlog. `CLOSED` tickets must be excluded at the queryset/service layer from every Customer and Staff endpoint, not merely hidden in the template. Only Admin Ticket Management and Admin audit/history may retrieve closed records.

- Submission requires subject, description, and issue type; drafts are unclassified.
- Model selection affects only future submissions. Each submitted ticket retains its original model, version, prediction, and confidence.
- Claiming is atomic, moving a ticket from Ticket Pool to the claiming staff member’s My Tickets and changing `OPEN` to `WAITING_FOR_SUPPORT`.
- Staff replies change `WAITING_FOR_SUPPORT` or `REOPENED` to `WAITING_FOR_CUSTOMER`. Customer replies change `WAITING_FOR_CUSTOMER` back to `WAITING_FOR_SUPPORT`.
- The lifecycle task changes `WAITING_FOR_CUSTOMER` to `RESOLVED` after 24 calendar hours without a customer reply, records `resolution_source=AUTOMATIC_NO_CUSTOMER_REPLY`, and starts the 72-hour customer review window.
- A customer may manually resolve an active ticket, which also starts the 72-hour review window. Reopening is allowed only during that window and changes the ticket to `REOPENED`.
- Staff replies and reroute reasons are required.
- Admins can read conversations but cannot reply. They can reroute, reassign, edit priority, and force close.
- A force close is a terminal administrative action. It requires a non-empty reason, moves the ticket to `CLOSED`, removes it from active customer/staff/pool views, records the closing administrator and timestamp, prevents customer reopening, and appends immutable activity and audit records. It remains visible only in Admin ticket history.

## SLA and Reporting

Use calendar-hour SLA targets:

| Priority | First staff reply | Customer-facing resolution |
| --- | ---: | ---: |
| High | 1 hour | 4 hours |
| Medium | 4 hours | 8 hours |
| Low | 8 hours | 16 hours |

Both clocks start on submission. Resolution time pauses while waiting for the customer and during the three-day customer review period. Reopening resumes the existing resolution clock. The scheduled lifecycle command automatically resolves an unanswered `WAITING_FOR_CUSTOMER` ticket after 24 hours, then closes a `RESOLVED` ticket after 72 hours. Automatic closure records the default reason: “Customer did not reopen the resolved ticket within 3 days.”

An open ticket needs Admin attention if its first-reply or resolution SLA is breached, or if routing fails. Overall SLA is met only when both applicable targets are met.

Role pages:

```text
/customer/dashboard/       /staff/dashboard/       /admin/overview/
/customer/tickets/         /staff/ticket-pool/     /admin/tickets/
/customer/tickets/new/     /staff/tickets/         /admin/models/
                           /staff/performance/      /admin/queues-staff/
                                                     /admin/activity/
```

Dashboard summaries poll JSON endpoints every 30 seconds and refresh after successful actions. Use Asia/Kuala_Lumpur time. Provide a Windows Task Scheduler job every five minutes for SLA breaches, model-prediction recovery, and automatic closure.

## Verification

Test permissions, draft/submission flows, inference failures, atomic claims, empty replies, staff rerouting, Admin read-only conversation access, exact status transitions, Admin-only closed-ticket query restrictions, automatic 24-hour resolution, 72-hour automatic closure/default reason, force-close reason validation, terminal force-close behaviour, audit records, all SLA targets, paused clocks, reopen behaviour, deactivated staff history, fixed-model selection, and dashboard period aggregation.
