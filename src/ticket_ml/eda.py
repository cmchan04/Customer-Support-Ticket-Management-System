"""Exploratory data analysis retained from the original preprocessing script."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns

from ticket_ml.config import TrainingConfig
from ticket_ml.data import load_and_prepare
from ticket_ml.text import TicketTextPreprocessor, ensure_nltk_resources


@dataclass(frozen=True)
class EdaSummary:
    records: int
    queue_classes: int
    priority_classes: int
    average_text_length: float
    output_dir: Path


def _save_distribution(series: pd.Series, title: str, output_path: Path) -> None:
    counts = series.value_counts()
    figure, axis = plt.subplots(figsize=(9, 5))
    sns.barplot(x=counts.index, y=counts.values, ax=axis, color="steelblue")
    axis.set(title=title, xlabel=series.name.title(), ylabel="Frequency")
    axis.tick_params(axis="x", rotation=45)
    for index, value in enumerate(counts.values):
        axis.text(index, value, str(int(value)), ha="center", va="bottom", fontsize=8)
    figure.tight_layout()
    figure.savefig(output_path, dpi=300)
    plt.close(figure)


def _frequency_rows(
    labels: pd.Series, token_lists: list[list[str]], field: str
) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for label in sorted(labels.unique()):
        tokens = [
            token
            for values, category in zip(token_lists, labels, strict=True)
            if category == label
            for token in values
        ]
        features = {
            "token": tokens,
            "bigram": [" ".join(tokens[index : index + 2]) for index in range(len(tokens) - 1)],
            "trigram": [" ".join(tokens[index : index + 3]) for index in range(len(tokens) - 2)],
        }
        for feature_type, values in features.items():
            for rank, (term, count) in enumerate(Counter(values).most_common(10), start=1):
                rows.append(
                    {
                        "field": field,
                        "label": label,
                        "feature_type": feature_type,
                        "rank": rank,
                        "term": term,
                        "count": count,
                    }
                )
    return rows


def run_eda(config: TrainingConfig, output_dir: str | Path | None = None) -> EdaSummary:
    """Write the existing distribution/length analysis plus reusable frequency exports."""
    ensure_nltk_resources()
    dataset = load_and_prepare(config)
    destination = Path(output_dir) if output_dir else config.report_dir / "eda"
    destination.mkdir(parents=True, exist_ok=True)

    cleaned_text = TicketTextPreprocessor().fit_transform(dataset.features)
    token_lists = [text.split() for text in cleaned_text]
    text_lengths = pd.Series([len(tokens) for tokens in token_lists], name="text_length")
    _save_distribution(
        dataset.queue.rename("queue"),
        "Queue Distribution of Customer Support Tickets",
        destination / "queue_distribution.png",
    )
    _save_distribution(
        dataset.priority.rename("priority"),
        "Priority Distribution of Customer Support Tickets",
        destination / "priority_distribution.png",
    )

    figure, axis = plt.subplots(figsize=(9, 5))
    axis.hist(text_lengths, bins=30, color="seagreen", edgecolor="black")
    axis.set(title="Ticket Text Length Distribution", xlabel="Number of Words", ylabel="Frequency")
    figure.tight_layout()
    figure.savefig(destination / "text_length_distribution.png", dpi=300)
    plt.close(figure)

    frequency_rows = _frequency_rows(dataset.queue, token_lists, "queue")
    frequency_rows.extend(_frequency_rows(dataset.priority, token_lists, "priority"))
    pd.DataFrame(frequency_rows).to_csv(destination / "frequency_analysis.csv", index=False)
    return EdaSummary(
        records=len(dataset.features),
        queue_classes=dataset.summary["queue_classes"],
        priority_classes=dataset.summary["priority_classes"],
        average_text_length=float(text_lengths.mean()),
        output_dir=destination,
    )
