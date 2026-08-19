"""Small interactive terminal interface for local ticket prediction and retraining."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ticket_ml.config import TrainingConfig
from ticket_ml.predictor import TicketPredictor
from ticket_ml.training import train_all, tune_joint_type

TICKET_TYPES = ("Incident", "Request", "Problem", "Change")


@dataclass
class TerminalMenu:
    """Run a deliberately small local UI without introducing a web framework."""

    config: TrainingConfig
    input_fn: Callable[[str], str] = input
    output_fn: Callable[[str], None] = print
    predictor_loader: Callable[[Path], TicketPredictor] = TicketPredictor.load
    separate_trainer: Callable[[TrainingConfig], Any] = train_all
    joint_trainer: Callable[[TrainingConfig], Any] = tune_joint_type

    def run(self) -> None:
        """Keep accepting actions until the user chooses to exit."""
        self.output_fn("\nCustomer Support Ticket ML")
        while True:
            self.output_fn("\n1. Predict a ticket")
            self.output_fn("2. Train/retrain joint model")
            self.output_fn("3. Train/retrain separate models")
            self.output_fn("4. Exit")
            choice = self._choose("Choose an action", {"1", "2", "3", "4"})

            if choice == "1":
                self._predict_ticket()
            elif choice == "2":
                self._retrain("joint")
            elif choice == "3":
                self._retrain("separate")
            else:
                self.output_fn("Goodbye.")
                return

    def _predict_ticket(self) -> None:
        subject = self.input_fn("Subject (optional): ").strip()
        body = self.input_fn("Body: ").strip()
        if not body:
            self.output_fn("Prediction cancelled: ticket body must not be empty.")
            return

        ticket_type = self._choose_ticket_type()
        model_kind = self._choose("Choose model: 1. Joint  2. Separate", {"1", "2"})
        model_dir = self.config.artifact_dir / "joint" if model_kind == "1" else self.config.artifact_dir
        model_name = "joint" if model_kind == "1" else "separate"

        try:
            prediction = self.predictor_loader(model_dir).predict(subject, body, ticket_type)
        except (FileNotFoundError, OSError, RuntimeError, ValueError) as error:
            self.output_fn(f"Could not use the {model_name} model: {error}")
            return

        self.output_fn(f"\nPrediction using the {model_name} model")
        self.output_fn(f"Queue: {prediction.queue}")
        self.output_fn(f"Priority: {prediction.priority}")

    def _choose_ticket_type(self) -> str:
        self.output_fn("Choose ticket type:")
        for index, ticket_type in enumerate(TICKET_TYPES, start=1):
            self.output_fn(f"{index}. {ticket_type}")
        choice = self._choose("Ticket type", {str(index) for index in range(1, len(TICKET_TYPES) + 1)})
        return TICKET_TYPES[int(choice) - 1]

    def _retrain(self, model_kind: str) -> None:
        label = "joint model" if model_kind == "joint" else "separate queue and priority models"
        confirmation = self.input_fn(
            f"Retraining replaces the current {label}. Type YES to continue: "
        ).strip()
        if confirmation != "YES":
            self.output_fn("Retraining cancelled.")
            return

        self.output_fn(f"Training {label}; this may take several minutes.")
        try:
            summary = (
                self.joint_trainer(self.config)
                if model_kind == "joint"
                else self.separate_trainer(self.config)
            )
        except (OSError, RuntimeError, ValueError) as error:
            self.output_fn(f"Training failed: {error}")
            return

        self.output_fn("Training completed.")
        self.output_fn(f"Model directory: {summary.artifact_dir}")
        self.output_fn(f"Report directory: {summary.report_dir}")

    def _choose(self, prompt: str, valid_choices: set[str]) -> str:
        while True:
            choice = self.input_fn(f"{prompt}: ").strip()
            if choice in valid_choices:
                return choice
            self.output_fn(f"Invalid choice. Enter one of: {', '.join(sorted(valid_choices))}.")
