from __future__ import annotations

from functools import wraps

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_GET

from web.accounts.models import User

from .queries import DashboardQueries


def role_required(*roles: str):
    def decorator(view):
        @wraps(view)
        @login_required
        def wrapped(request, *args, **kwargs):
            if request.user.role not in roles:
                return JsonResponse({"detail": "Access denied."}, status=403)
            return view(request, *args, **kwargs)

        return wrapped

    return decorator


def _query_int(request, name: str, default: int | None = None) -> int | None:
    try:
        return max(1, int(request.GET.get(name, default))) if request.GET.get(name) is not None else default
    except (TypeError, ValueError):
        return default


@role_required(User.Role.CUSTOMER)
@require_GET
def customer_dashboard(request):
    return JsonResponse(DashboardQueries().customer_dashboard(
        request.user,
        page=_query_int(request, "page"),
        page_size=_query_int(request, "page_size", 10) or 10,
    ))


@role_required(User.Role.STAFF)
@require_GET
def staff_dashboard(request):
    return JsonResponse(DashboardQueries().staff_dashboard(
        request.user,
        ticket_pool_page=_query_int(request, "pool_page"),
        my_tickets_page=_query_int(request, "my_page"),
        page_size=_query_int(request, "page_size", 10) or 10,
        pool_priority=request.GET.get("pool_priority", "all"),
        pool_type=request.GET.get("pool_type", "all"),
        pool_search=request.GET.get("pool_search", ""),
        pool_sort=request.GET.get("pool_sort", "createdAt"),
        pool_direction=request.GET.get("pool_direction", "desc"),
        my_priority=request.GET.get("my_priority", "all"),
        my_status=request.GET.get("my_status", "all"),
        my_search=request.GET.get("my_search", ""),
        my_sort=request.GET.get("my_sort", "lastUpdated"),
        my_direction=request.GET.get("my_direction", "desc"),
        resolved_period=request.GET.get("resolved_period", "today"),
    ))


@role_required(User.Role.STAFF)
@require_GET
def staff_performance(request):
    try:
        page = max(1, int(request.GET.get("page", "1")))
    except ValueError:
        page = 1
    return JsonResponse(DashboardQueries().staff_performance(request.user, page=page, period=request.GET.get("period", "month")))


@role_required(User.Role.ADMIN)
@require_GET
def admin_overview(request):
    return JsonResponse(DashboardQueries().admin_overview(
        request.GET.get("period", "day"),
        overdue_period=request.GET.get("overdue_period", request.GET.get("period", "day")),
        attention_page=_query_int(request, "attention_page"),
        page_size=_query_int(request, "page_size", 5) or 5,
    ))


@role_required(User.Role.ADMIN)
@require_GET
def admin_ticket_management(request):
    return JsonResponse(DashboardQueries().admin_ticket_management(
        include_closed=True,
        page=_query_int(request, "page"),
        attention_page=_query_int(request, "attention_page"),
        page_size=_query_int(request, "page_size", 10) or 10,
        search=request.GET.get("search", ""),
        model=request.GET.get("model", "all"),
        issue_type=request.GET.get("type", "all"),
        queue=request.GET.get("queue", "all"),
        priority=request.GET.get("priority", "all"),
        status=request.GET.get("status", "all"),
        assignee=request.GET.get("assignee", "all"),
        sort=request.GET.get("sort", "updated"),
        direction=request.GET.get("direction", "desc"),
    ))
