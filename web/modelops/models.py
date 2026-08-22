"""Fixed model deployment records displayed by the Admin model centre."""

from __future__ import annotations

from django.db import models


class ModelDeployment(models.Model):
    class Family(models.TextChoices):
        JOINT = "joint", "Joint"
        SEPARATE = "separate", "Separate"

    family = models.CharField(max_length=24, choices=Family.choices, unique=True)
    version = models.CharField(max_length=120)
    artifact_directory = models.CharField(max_length=500)
    queue_macro_f1 = models.DecimalField(max_digits=6, decimal_places=4, null=True, blank=True)
    priority_macro_f1 = models.DecimalField(max_digits=6, decimal_places=4, null=True, blank=True)
    priority_accuracy = models.DecimalField(max_digits=6, decimal_places=4, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    is_fixed = models.BooleanField(default=True)
    selected_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("family",)

    def __str__(self) -> str:
        return f"{self.get_family_display()} {self.version}"
