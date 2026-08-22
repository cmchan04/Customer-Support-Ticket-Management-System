"""Password policy shared by staff creation and password changes."""

from __future__ import annotations

import re

from django.core.exceptions import ValidationError


class SupportPasswordValidator:
    def validate(self, password: str, user=None) -> None:
        missing = []
        if not re.search(r"[A-Z]", password):
            missing.append("one capitalized alphabet")
        if not re.search(r"\d", password):
            missing.append("one number")
        if not re.search(r"[^A-Za-z0-9]", password):
            missing.append("one special character")
        if missing:
            raise ValidationError("Password must include " + ", ".join(missing) + ".")

    def get_help_text(self) -> str:
        return "Password must include at least one capitalized alphabet, one number, and one special character."
