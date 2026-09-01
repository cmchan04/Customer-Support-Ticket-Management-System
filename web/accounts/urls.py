from django.urls import path

from .views import (
    admin_create_staff,
    admin_deactivate_staff,
    admin_queue_staff,
    admin_staff_summary,
    admin_update_staff,
    change_password,
)

urlpatterns = [
    path("queues-staff/", admin_queue_staff, name="admin-queues-staff"),
    path("staff/", admin_create_staff, name="admin-create-staff"),
    path("staff/<int:user_id>/", admin_update_staff, name="admin-update-staff"),
    path("staff/<int:user_id>/deactivate/", admin_deactivate_staff, name="admin-deactivate-staff"),
    path("staff/<int:user_id>/summary/", admin_staff_summary, name="admin-staff-summary"),
    path("change-password/", change_password, name="change-password"),
]
