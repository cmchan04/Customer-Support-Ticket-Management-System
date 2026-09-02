## One-time setup

From the repository root, activate the existing environment and install the
project dependencies:

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
python web\manage.py migrate
python web\manage.py seed_demo_data
python web\manage.py sync_model_deployments
```

Run the desktop backend:

```powershell
python web\manage.py runserver 127.0.0.1:8000
```

The development accounts created by `seed_demo_data` are:

| Role | Email |
| --- | --- |
| Customer | `weilun.lim@gmail.com` |
| Staff | `nicholas.yee@yahoo.com` |
| Admin | `chunming.chan@admin.com` |

The local demo password is `DemoP@ssw0rd` for all accounts created by either
seed command. You can override it with `--password` for a temporary
development dataset. Do not use these commands for production accounts.

## Fixed model deployment

The merged IT/Technical experiment is promoted into the normal read-only model
locations with the ML command below. It first archives the previous separate
and joint artifacts under family- and training-method-specific directories:

```powershell
ticket-ml promote-merged-models --model-root artifacts\models --yes
python web\manage.py sync_model_deployments
```

Separate predictions load from `artifacts/models/`; Joint predictions load from
`artifacts/models/joint/`. The archived predecessors are retained under the
unified workspace archive at `archive/model_deployment/separate/` and
`archive/model_deployment/joint/`.
After this version of the code is running, subsequent promotions are detected
on the next request because the `PredictionService` cache keys include the
deployed metadata timestamp. Restart the server once after upgrading to this
cache-aware version.
Existing ticket prediction records are immutable and continue to identify the
model family and version used when each ticket was submitted.

## Synthetic e-commerce test dataset

To exercise the complete dashboard and ticket workflow with a realistic local
dataset, first preview the generated records (this does not write to SQLite):

```powershell
python web\manage.py seed_ecommerce_demo_data
```

The default preview covers the 61 completed days before today: 20 Malaysian
e-commerce customer-support tickets per day (1,220 tickets total), 180
customers using realistic public email domains, 20 staff members distributed
across the nine queues, and two administrators. Ticket subjects cover order
tracking, payments, returns, marketplace access, product issues, seller tools,
and similar e-commerce support requests. Synthetic tickets are terminal
operational history (resolved or closed) and are never a live customer
backlog or model-training/evaluation sample.

After reviewing the preview, insert exactly that deterministic batch:

```powershell
python web\manage.py seed_ecommerce_demo_data --apply
```

The command only creates synthetic local records; it never removes existing
records and remembers its batch key so the same command does not create
duplicates. The stored predictions and confidence values are explicitly
synthetic operational evidence—it does not run the Joblib classifier 1,220
times.

If a synthetic batch has already been inserted, retire it after reviewing the
data so no demo ticket remains in the live workflow and reset every demo
account password:

```powershell
python web\manage.py retire_demo_data
```

This preserves tickets, prediction records, messages, and audit history for
operational reporting, changes all synthetic tickets to `CLOSED`, and resets
the local demo accounts to `DemoP@ssw0rd`. Real tickets are not modified.

## Queue taxonomy migration

The deployed model uses one `Technical Support` destination for both the old
technical and IT categories. To preview and then apply the one-time database
merge:

```powershell
python web\manage.py merge_support_queues
python web\manage.py merge_support_queues --apply
```

The migration moves existing tickets and staff assignments, normalizes stored
prediction labels and reroute history, writes an audit event, and removes the
obsolete `IT Support` queue. It is safe to run again after the merge.

## Module seams

- `tickets.workflow.TicketWorkflow` owns all ticket transitions, authorization,
  SLA clocks, rerouting, force closure, and audit writes.
- `modelops.services.PredictionService` is the only backend adapter that loads
  the existing Joint or Separate Joblib artifacts. It calls
  `TicketPredictor.predict_scored(...)` and persists confidence evidence.
- `reporting.queries.DashboardQueries` owns role-filtered dashboard counts,
  period aggregations, database-backed search/filter/sort, and pagination. The
  UI requests only the current page; it does not filter a complete ticket
  dataset in the browser.
- `accounts.services.StaffDirectory` owns staff creation, fixed-email profile
  changes, queue assignment, and deactivation.
- `audit.models.AuditEvent` is append-only and powers the Admin activity view.

Views are intentionally thin adapters over these interfaces. The model layer
never retrains from a web request and there is no rollback endpoint; both saved
model families are fixed for this one-time deployment.

## JSON endpoints

All endpoints require a Django session login. Customer and staff endpoints
exclude `CLOSED` tickets at the query/visibility layer; Admin ticket management
can retrieve them for history.

```text
GET  /api/reporting/customer/dashboard/
GET  /api/reporting/staff/dashboard/
GET  /api/reporting/staff/performance/?page=1&period=week|month|quarter|year
GET  /api/reporting/admin/overview/?period=day|week|month|quarter|year
GET  /api/reporting/admin/ticket-management/
GET  /api/audit/activity/
GET  /api/accounts/queues-staff/?queue_id=<id>&period=week|month|quarter|year
GET  /api/accounts/staff/<id>/summary/?period=week|month|quarter|year
POST /api/accounts/staff/
POST /api/accounts/staff/<id>/
POST /api/accounts/staff/<id>/deactivate/
POST /api/model/predict/
GET  /api/tickets/<id>/
GET  /api/model/deployments/
GET  /api/model/deployments/<joint|separate>/operational/?period=month|quarter|year
POST /api/model/deployments/<joint|separate>/activate/
```

Customer dashboard and ticket-detail responses intentionally omit internal
routing fields such as priority, queue ownership, model predictions, confidence
scores, and reroute history. Staff and Admin responses retain those fields for
ticket handling and review.

The queues-and-staff response keeps two staff collections separate: `staff`
is filtered by the selected dashboard queue for the directory, while
`assignment_staff` always contains all active staff and their current queue.
Ticket-management assignment controls use `assignment_staff`, so changing the
directory filter cannot hide staff from a ticket's selected route queue.

Dashboard list controls are sent as query parameters. Customer uses
`page`/`page_size`; Staff uses `pool_page`, `my_page`, `pool_priority`,
`pool_type`, `pool_sort`, `pool_direction`, `my_priority`, `my_status`,
`my_search`, `my_sort`, `my_direction`, and `resolved_period`. Admin ticket
management uses `page`, `attention_page`, `page_size`, `search`, `model`,
`type`, `queue`, `priority`, `status`, `assignee`, `sort`, and `direction`.
Audit history uses `q` and `category`. Period buttons (`day`, `week`,
`month`, `quarter`, `year`) are evaluated by Django against SQLite timestamps,
so changing a filter no longer requires downloading or scanning every ticket
in the browser.

Ticket actions are POST endpoints under `/api/tickets/` for draft creation,
submission, claiming, replies, resolve/reopen, staff reroute, Admin routing,
and Admin force close. JSON errors are returned with a 4xx status and no
partial state change. Customer draft creation and submission accept an
`Idempotency-Key` header. The UI sends one key per form action, so retries
caused by latency return the original draft/ticket instead of creating a
duplicate.

## Lifecycle automation

Run this command every five minutes using Windows Task Scheduler:

```powershell
python web\manage.py run_ticket_lifecycle
```

It automatically resolves `WAITING_FOR_CUSTOMER` tickets after 24 hours and
closes `RESOLVED` tickets after the three-day review period. Each transition
creates an immutable audit event. A force close requires an Admin reason and
is terminal.

## Verification

```powershell
python web\manage.py check
python web\manage.py test web.tickets
python -m ruff check src tests web
```
