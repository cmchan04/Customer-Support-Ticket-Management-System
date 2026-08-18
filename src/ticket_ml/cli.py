"""Command-line adapter for setup, EDA, training, and prediction."""

from __future__ import annotations

import argparse
import json
from collections.abc import Sequence
from dataclasses import asdict
from pathlib import Path

from ticket_ml.config import TrainingConfig
from ticket_ml.eda import run_eda
from ticket_ml.predictor import TicketPredictor
from ticket_ml.text import download_nltk_resources
from ticket_ml.training import train_all, tune_weighted_svm


def _default_config_path() -> Path:
    return Path(__file__).resolve().parents[2] / "configs" / "training.toml"


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Customer support ticket ML utilities")
    commands = parser.add_subparsers(dest="command", required=True)

    commands.add_parser("setup-nltk", help="Download the required NLTK resources once")

    eda = commands.add_parser("eda", help="Run exploratory data analysis")
    eda.add_argument("--config", type=Path, default=_default_config_path())
    eda.add_argument("--output-dir", type=Path)

    training = commands.add_parser("train", help="Train queue and priority models")
    training.add_argument("--config", type=Path, default=_default_config_path())

    weighting = commands.add_parser(
        "tune-weighting", help="Tune subject emphasis for the word/character Linear SVM"
    )
    weighting.add_argument("--config", type=Path, default=_default_config_path())

    prediction = commands.add_parser("predict", help="Predict one ticket's queue and priority")
    prediction.add_argument("--model-dir", type=Path, default=Path("artifacts/models"))
    prediction.add_argument("--subject", default="")
    prediction.add_argument("--body", required=True)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.command == "setup-nltk":
        missing = download_nltk_resources()
        if missing:
            raise RuntimeError(f"NLTK setup incomplete: {', '.join(missing)}")
        print("NLTK resources are ready.")
        return 0
    if args.command == "train":
        summary = train_all(TrainingConfig.from_toml(args.config))
        print(json.dumps(summary.as_dict(), indent=2, sort_keys=True))
        return 0
    if args.command == "tune-weighting":
        summary = tune_weighted_svm(TrainingConfig.from_toml(args.config))
        print(json.dumps(summary.as_dict(), indent=2, sort_keys=True))
        return 0
    if args.command == "eda":
        summary = run_eda(TrainingConfig.from_toml(args.config), args.output_dir)
        print(json.dumps(asdict(summary), indent=2, default=str, sort_keys=True))
        return 0
    if args.command == "predict":
        prediction = TicketPredictor.load(args.model_dir).predict(args.subject, args.body)
        print(json.dumps(asdict(prediction), sort_keys=True))
        return 0
    raise RuntimeError(f"Unsupported command: {args.command}")
