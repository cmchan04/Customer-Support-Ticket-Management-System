"""Command-line adapter for setup, EDA, training, and prediction."""

from __future__ import annotations

import argparse
import json
from collections.abc import Sequence
from dataclasses import asdict, replace
from pathlib import Path

from ticket_ml.config import TrainingConfig
from ticket_ml.eda import run_eda
from ticket_ml.predictor import TicketPredictor
from ticket_ml.terminal_ui import TerminalMenu
from ticket_ml.text import download_nltk_resources
from ticket_ml.training import (
    train_all,
    tune_joint_type,
    tune_type_onehot,
    tune_type_router,
    tune_type_svm,
)


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

    type_tuning = commands.add_parser(
        "tune-type", help="Tune customer-selected ticket type for the Linear SVM"
    )
    type_tuning.add_argument("--config", type=Path, default=_default_config_path())

    type_onehot = commands.add_parser(
        "tune-type-onehot", help="Tune an explicit one-hot ticket type feature weight"
    )
    type_onehot.add_argument("--config", type=Path, default=_default_config_path())

    type_router = commands.add_parser(
        "tune-type-router",
        help="Tune a separate Linear SVM for each known ticket type",
    )
    type_router.add_argument("--config", type=Path, default=_default_config_path())

    joint_type = commands.add_parser(
        "tune-joint-type",
        help="Train or retrain the joint queue/priority model by customer-selected type",
    )
    joint_type.add_argument("--config", type=Path, default=_default_config_path())

    merge_it_technical = commands.add_parser(
        "tune-merge-it-technical",
        help="Run an isolated experiment merging IT Support into Technical Support",
    )
    merge_it_technical.add_argument("--config", type=Path, default=_default_config_path())

    merge_it_technical_joint = commands.add_parser(
        "tune-merge-it-technical-joint",
        help="Run an isolated joint experiment merging IT Support into Technical Support",
    )
    merge_it_technical_joint.add_argument(
        "--config", type=Path, default=_default_config_path()
    )

    menu = commands.add_parser(
        "menu", help="Open the interactive terminal menu for prediction and retraining"
    )
    menu.add_argument("--config", type=Path, default=_default_config_path())

    prediction = commands.add_parser("predict", help="Predict one ticket's queue and priority")
    prediction.add_argument("--model-dir", type=Path, default=Path("artifacts/models"))
    prediction.add_argument("--subject", default="")
    prediction.add_argument("--ticket-type", default="", help="Incident, Request, Problem, or Change")
    prediction.add_argument("--body", required=True)
    prediction.add_argument(
        "--with-confidence",
        action="store_true",
        help="Include calibrated confidence percentages when the saved artifact supports them",
    )
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
    if args.command == "tune-type":
        summary = tune_type_svm(TrainingConfig.from_toml(args.config))
        print(json.dumps(summary.as_dict(), indent=2, sort_keys=True))
        return 0
    if args.command == "tune-type-onehot":
        summary = tune_type_onehot(TrainingConfig.from_toml(args.config))
        print(json.dumps(summary.as_dict(), indent=2, sort_keys=True))
        return 0
    if args.command == "tune-type-router":
        summary = tune_type_router(TrainingConfig.from_toml(args.config))
        print(json.dumps(summary.as_dict(), indent=2, sort_keys=True))
        return 0
    if args.command == "tune-joint-type":
        summary = tune_joint_type(TrainingConfig.from_toml(args.config))
        print(json.dumps(summary.as_dict(), indent=2, sort_keys=True))
        return 0
    if args.command == "tune-merge-it-technical":
        base_config = TrainingConfig.from_toml(args.config)
        experiment_config = replace(
            base_config,
            artifact_dir=base_config.artifact_dir / "experiments" / "merge_it_technical",
            report_dir=base_config.report_dir / "merge_it_technical_experiment",
            cache_dir=base_config.cache_dir / "merge_it_technical_experiment",
            queue_label_map=(("IT Support", "Technical Support"),),
        )
        summary = train_all(experiment_config)
        print(json.dumps(summary.as_dict(), indent=2, sort_keys=True))
        return 0
    if args.command == "tune-merge-it-technical-joint":
        base_config = TrainingConfig.from_toml(args.config)
        experiment_config = replace(
            base_config,
            queue_label_map=(("IT Support", "Technical Support"),),
        )
        summary = tune_joint_type(
            experiment_config,
            artifact_dir=(
                base_config.artifact_dir
                / "experiments"
                / "merge_it_technical_joint"
            ),
            report_dir=base_config.report_dir / "merge_it_technical_joint_experiment",
            cache_dir=base_config.cache_dir / "merge_it_technical_joint_experiment",
        )
        print(json.dumps(summary.as_dict(), indent=2, sort_keys=True))
        return 0
    if args.command == "menu":
        TerminalMenu(TrainingConfig.from_toml(args.config)).run()
        return 0
    if args.command == "eda":
        summary = run_eda(TrainingConfig.from_toml(args.config), args.output_dir)
        print(json.dumps(asdict(summary), indent=2, default=str, sort_keys=True))
        return 0
    if args.command == "predict":
        predictor = TicketPredictor.load(args.model_dir)
        prediction = (
            predictor.predict_scored(args.subject, args.body, args.ticket_type)
            if args.with_confidence
            else predictor.predict(args.subject, args.body, args.ticket_type)
        )
        print(json.dumps(asdict(prediction), sort_keys=True))
        return 0
    raise RuntimeError(f"Unsupported command: {args.command}")
