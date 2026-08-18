from __future__ import annotations

import pandas as pd
import pytest

from ticket_ml.text import TicketTextPreprocessor, preprocess_ticket_text


def test_text_preprocessing_is_deterministic_and_removes_noise():
    value = preprocess_ticket_text(
        "Password Reset", "Please reset my password at https://example.com now!"
    )
    again = preprocess_ticket_text(
        "Password Reset", "Please reset my password at https://example.com now!"
    )

    assert value == again
    assert "password" in value
    assert "https" not in value
    assert "please" not in value


def test_subject_weight_repeats_subject_without_changing_body_processing():
    normal = preprocess_ticket_text("Account outage", "Service is unavailable.")
    weighted = preprocess_ticket_text(
        "Account outage", "Service is unavailable.", subject_weight=3
    )

    assert normal.count("account") == 1
    assert weighted.count("account") == 3
    assert weighted.count("service") == 1


def test_transformer_requires_subject_and_body_columns():
    with pytest.raises(ValueError, match="Missing text columns"):
        TicketTextPreprocessor().fit(pd.DataFrame({"body": ["text"]}))
