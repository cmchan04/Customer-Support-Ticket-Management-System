"""ASGI config for the Django workspace."""

from __future__ import annotations

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "web.config.settings")
application = get_asgi_application()
