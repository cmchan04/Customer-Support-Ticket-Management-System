from django.urls import path

from .views import (
    admin_force_close,
    admin_route,
    customer_create_draft,
    customer_delete_draft,
    customer_reopen,
    customer_reply,
    customer_resolve,
    customer_submit,
    customer_update_draft,
    staff_claim,
    staff_reply,
    staff_request_reroute,
    ticket_detail,
)

urlpatterns = [
    path("<int:ticket_id>/", ticket_detail, name="ticket-detail"),
    path("customer/drafts/", customer_create_draft, name="customer-create-draft"),
    path("customer/drafts/<int:ticket_id>/", customer_update_draft, name="customer-update-draft"),
    path("customer/drafts/<int:ticket_id>/discard/", customer_delete_draft, name="customer-delete-draft"),
    path("customer/tickets/<int:ticket_id>/submit/", customer_submit, name="customer-submit"),
    path("customer/tickets/<int:ticket_id>/reply/", customer_reply, name="customer-reply"),
    path("customer/tickets/<int:ticket_id>/resolve/", customer_resolve, name="customer-resolve"),
    path("customer/tickets/<int:ticket_id>/reopen/", customer_reopen, name="customer-reopen"),
    path("staff/ticket-pool/<int:ticket_id>/claim/", staff_claim, name="staff-claim"),
    path("staff/tickets/<int:ticket_id>/reply/", staff_reply, name="staff-reply"),
    path("staff/tickets/<int:ticket_id>/reroute/", staff_request_reroute, name="staff-reroute"),
    path("admin/tickets/<int:ticket_id>/route/", admin_route, name="admin-route"),
    path("admin/tickets/<int:ticket_id>/force-close/", admin_force_close, name="admin-force-close"),
]
