from django.urls import path

from .views import (
    admin_overview,
    admin_ticket_management,
    customer_dashboard,
    staff_dashboard,
    staff_performance,
)

urlpatterns = [
    path("customer/dashboard/", customer_dashboard, name="customer-dashboard"),
    path("staff/dashboard/", staff_dashboard, name="staff-dashboard"),
    path("staff/performance/", staff_performance, name="staff-performance"),
    path("admin/overview/", admin_overview, name="admin-overview"),
    path("admin/ticket-management/", admin_ticket_management, name="admin-ticket-management"),
]
