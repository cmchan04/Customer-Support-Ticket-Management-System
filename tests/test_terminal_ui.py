from __future__ import annotations

from types import SimpleNamespace

from ticket_ml.predictor import TicketPrediction
from ticket_ml.terminal_ui import TerminalMenu


def _scripted_input(values: list[str]):
    iterator = iter(values)
    return lambda _prompt: next(iterator)


def test_menu_predicts_with_the_selected_model(smoke_training):
    config, _ = smoke_training
    outputs: list[str] = []
    loaded_dirs = []

    class FakePredictor:
        def predict(self, subject: str, body: str, ticket_type: str) -> TicketPrediction:
            assert (subject, body, ticket_type) == ("Payment problem", "Charged twice", "Incident")
            return TicketPrediction(queue="Billing", priority="high")

    menu = TerminalMenu(
        config,
        input_fn=_scripted_input(["1", "Payment problem", "Charged twice", "1", "1", "4"]),
        output_fn=outputs.append,
        predictor_loader=lambda model_dir: (loaded_dirs.append(model_dir) or FakePredictor()),
    )

    menu.run()

    assert loaded_dirs == [config.artifact_dir / "joint"]
    assert "Queue: Billing" in outputs
    assert "Priority: high" in outputs


def test_menu_offers_retraining_for_both_model_families(smoke_training):
    config, _ = smoke_training
    outputs: list[str] = []
    trained: list[str] = []
    summary = SimpleNamespace(artifact_dir=config.artifact_dir, report_dir=config.report_dir)

    menu = TerminalMenu(
        config,
        input_fn=_scripted_input(["2", "YES", "3", "YES", "4"]),
        output_fn=outputs.append,
        joint_trainer=lambda received: (trained.append("joint") or summary),
        separate_trainer=lambda received: (trained.append("separate") or summary),
    )

    menu.run()

    assert trained == ["joint", "separate"]
    assert outputs.count("Training completed.") == 2
