"""URL map for page and JSON seams."""

from __future__ import annotations

from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.urls import include, path

from web.accounts.views import home, profile

urlpatterns = [
    path("admin/", admin.site.urls),
    path("login/", auth_views.LoginView.as_view(template_name="accounts/login.html"), name="login"),
    path("logout/", auth_views.LogoutView.as_view(), name="logout"),
    path("", home, name="home"),
    path("profile/", profile, name="profile"),
    path("api/accounts/", include("web.accounts.urls")),
    path("api/tickets/", include("web.tickets.urls")),
    path("api/model/", include("web.modelops.urls")),
    path("api/reporting/", include("web.reporting.urls")),
    path("api/audit/", include("web.audit.urls")),
]
