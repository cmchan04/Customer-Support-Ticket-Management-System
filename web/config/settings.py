"""Django settings for the desktop support workspace."""

from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "local-development-only-change-me")
DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"
ALLOWED_HOSTS = [host for host in os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if host]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "web.accounts.apps.AccountsConfig",
    "web.tickets.apps.TicketsConfig",
    "web.modelops.apps.ModelopsConfig",
    "web.reporting.apps.ReportingConfig",
    "web.audit.apps.AuditConfig",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "web.config.urls"
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "web" / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]
WSGI_APPLICATION = "web.config.wsgi.application"
ASGI_APPLICATION = "web.config.asgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
        "OPTIONS": {"timeout": 20},
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "web.accounts.validators.SupportPasswordValidator"},
]
AUTH_USER_MODEL = "accounts.User"
LOGIN_URL = "/login/"
LOGIN_REDIRECT_URL = "/"
LOGOUT_REDIRECT_URL = "/login/"

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kuala_Lumpur"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "web" / "staticfiles"
# The established desktop prototype is the authenticated workspace shell.  In
# development, Django serves these files directly; deployment can collect them
# as normal static assets.
STATICFILES_DIRS = [BASE_DIR / "web" / "ui-prototype"]
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# The model layer is intentionally read-only at runtime. Model selection and
# retraining remain outside the web process, as required by the one-time
# deployment scope.
MODEL_DIR = Path(os.environ.get("TICKET_MODEL_DIR", BASE_DIR / "artifacts" / "models"))
JOINT_MODEL_DIR = Path(
    os.environ.get("TICKET_JOINT_MODEL_DIR", MODEL_DIR / "joint")
)
ACTIVE_MODEL_FAMILY = os.environ.get("TICKET_ACTIVE_MODEL", "joint")
MODEL_VERSION = os.environ.get("TICKET_MODEL_VERSION", "local-artifact")
