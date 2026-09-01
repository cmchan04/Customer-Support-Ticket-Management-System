"""Shared English ticket-text preprocessing for training and inference."""

from __future__ import annotations

import re
from collections.abc import Iterable

import nltk
import pandas as pd
from nltk.stem import WordNetLemmatizer
from nltk.tokenize import word_tokenize
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS
from sklearn.preprocessing import OneHotEncoder

NLTK_RESOURCES = {
    "punkt": "tokenizers/punkt",
    "wordnet": "corpora/wordnet",
    "omw-1.4": "corpora/omw-1.4",
}
_LEMMATIZER = WordNetLemmatizer()


def missing_nltk_resources() -> list[str]:
    """List NLTK resources needed by the documented preprocessing flow."""
    missing: list[str] = []
    for name, resource_path in NLTK_RESOURCES.items():
        try:
            nltk.data.find(resource_path)
        except LookupError:
            try:
                # The NLTK downloader may keep corpora as ZIP archives on Windows.
                nltk.data.find(f"{resource_path}.zip")
            except LookupError:
                missing.append(name)
    return missing


def download_nltk_resources() -> list[str]:
    """Explicit one-time setup; never call this while serving a prediction."""
    for resource in NLTK_RESOURCES:
        nltk.download(resource, quiet=True)
    return missing_nltk_resources()


def ensure_nltk_resources() -> None:
    missing = missing_nltk_resources()
    if missing:
        joined = ", ".join(missing)
        raise RuntimeError(f"Missing NLTK resources: {joined}. Run `ticket-ml setup-nltk` first.")


def preprocess_ticket_text(
    subject: object,
    body: object,
    *,
    subject_weight: int = 1,
    ticket_type: object = "",
    type_weight: int = 0,
) -> str:
    """Create the documented normalized text representation from ticket input."""
    if subject_weight < 1:
        raise ValueError("subject_weight must be at least 1.")
    if type_weight < 0:
        raise ValueError("type_weight must not be negative.")
    subject_text = "" if pd.isna(subject) else str(subject)
    body_text = "" if pd.isna(body) else str(body)
    type_text = "" if pd.isna(ticket_type) else str(ticket_type)
    raw_text = " ".join(
        [subject_text] * subject_weight + [body_text] + [type_text] * type_weight
    )
    text = re.sub(r"\\[nrt]+", " ", raw_text)
    text = re.sub(r"[\r\n\t]+", " ", text)
    text = re.sub(r"https?://\S+|www\.\S+", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"[^a-z0-9\s]", " ", text.lower())
    text = re.sub(r"\s+", " ", text).strip()

    # preserve_line avoids sentence tokenization while retaining NLTK word tokenization.
    tokens = word_tokenize(text, preserve_line=True)
    filtered = (token for token in tokens if token not in ENGLISH_STOP_WORDS)
    return " ".join(_LEMMATIZER.lemmatize(token) for token in filtered)


class TicketTextPreprocessor(BaseEstimator, TransformerMixin):
    """scikit-learn transformer that makes subject/body text inference-safe."""

    def __init__(self, *, subject_weight: int = 1, type_weight: int = 0) -> None:
        # The active workflows always use the neutral 1:1 subject/body ratio.
        # This option remains only so historical serialized pipelines can still
        # be read; 2:1--4:1 subject emphasis was retired after lower CV results.
        self.subject_weight = subject_weight
        self.type_weight = type_weight

    def fit(self, x: pd.DataFrame, y: object = None) -> TicketTextPreprocessor:
        subject_weight = getattr(self, "subject_weight", 1)
        type_weight = getattr(self, "type_weight", 0)
        if subject_weight < 1:
            raise ValueError("subject_weight must be at least 1.")
        if type_weight < 0:
            raise ValueError("type_weight must not be negative.")
        self._validate_input(x)
        return self

    def transform(self, x: pd.DataFrame) -> list[str]:
        self._validate_input(x)
        # Models saved before subject weighting was introduced do not contain
        # this attribute. Defaulting to 1 preserves their original behaviour.
        subject_weight = getattr(self, "subject_weight", 1)
        type_weight = getattr(self, "type_weight", 0)
        subjects: Iterable[object] = x["subject"]
        bodies: Iterable[object] = x["body"]
        types: Iterable[object] = x["type"] if "type" in x.columns else [""] * len(x)
        return [
            preprocess_ticket_text(
                subject,
                body,
                subject_weight=subject_weight,
                ticket_type=ticket_type,
                type_weight=type_weight,
            )
            for subject, body, ticket_type in zip(subjects, bodies, types, strict=True)
        ]

    @staticmethod
    def _validate_input(x: pd.DataFrame) -> None:
        if not isinstance(x, pd.DataFrame):
            raise TypeError("TicketTextPreprocessor requires a pandas DataFrame.")
        missing = {"subject", "body"} - set(x.columns)
        if missing:
            raise ValueError(f"Missing text columns: {', '.join(sorted(missing))}")


class TicketTypeOneHot(BaseEstimator, TransformerMixin):
    """Leak-safe one-hot encoding of the customer-selected ticket type."""

    def fit(self, x: pd.DataFrame, y: object = None) -> TicketTypeOneHot:
        self._validate_input(x)
        self.encoder_ = OneHotEncoder(handle_unknown="ignore", sparse_output=True)
        self.encoder_.fit(x[["type"]].fillna("Unknown"))
        return self

    def transform(self, x: pd.DataFrame):
        self._validate_input(x)
        return self.encoder_.transform(x[["type"]].fillna("Unknown"))

    @staticmethod
    def _validate_input(x: pd.DataFrame) -> None:
        if not isinstance(x, pd.DataFrame):
            raise TypeError("TicketTypeOneHot requires a pandas DataFrame.")
        if "type" not in x.columns:
            raise ValueError("Missing text column: type")
