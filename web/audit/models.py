"""Append-only audit records for ticket, model, and account changes."""

from __future__ import annotations

from django.conf import settings
from django.db import models


class AuditEvent(models.Model):
    class Category(models.TextChoices):
        TICKET = "TICKET", "Ticket"
        ROUTING = "ROUTING", "Routing"
        ACCESS = "ACCESS", "Access"
        MODEL = "MODEL", "Model"
        SYSTEM = "SYSTEM", "System"

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="audit_events",
    )
    category = models.CharField(max_length=16, choices=Category.choices)
    action = models.CharField(max_length=120)
    object_type = models.CharField(max_length=80, blank=True)
    object_id = models.CharField(max_length=120, blank=True)
    detail = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at", "-id")
        indexes = [models.Index(fields=("category", "created_at")), models.Index(fields=("object_type", "object_id"))]

    def save(self, *args, **kwargs):
        if self.pk:
            raise ValueError("AuditEvent records are immutable.")
        return super().save(*args, **kwargs)
