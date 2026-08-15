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


def preprocess_ticket_text(subject: object, body: object) -> str:
    """Create the documented normalized text representation from ticket input."""
    raw_text = f"{'' if pd.isna(subject) else subject} {'' if pd.isna(body) else body}"
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

    def fit(self, x: pd.DataFrame, y: object = None) -> TicketTextPreprocessor:
        self._validate_input(x)
        return self

    def transform(self, x: pd.DataFrame) -> list[str]:
        self._validate_input(x)
        subjects: Iterable[object] = x["subject"]
        bodies: Iterable[object] = x["body"]
        return [
            preprocess_ticket_text(subject, body)
            for subject, body in zip(subjects, bodies, strict=True)
        ]

    @staticmethod
    def _validate_input(x: pd.DataFrame) -> None:
        if not isinstance(x, pd.DataFrame):
            raise TypeError("TicketTextPreprocessor requires a pandas DataFrame.")
        missing = {"subject", "body"} - set(x.columns)
        if missing:
            raise ValueError(f"Missing text columns: {', '.join(sorted(missing))}")
