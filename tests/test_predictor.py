from __future__ import annotations

import json

import pytest

from ticket_ml.cli import main
from ticket_ml.predictor import TicketPredictor


def test_predictor_and_cli_return_same_result(smoke_training, capsys):
    config, _ = smoke_training
    predictor_result = TicketPredictor.load(config.artifact_dir).predict(
        "Technical high request", "Customer reports a technical issue."
    )

    assert (
        main(
            [
                "predict",
                "--model-dir",
                str(config.artifact_dir),
                "--subject",
                "Technical high request",
                "--body",
                "Customer reports a technical issue.",
            ]
        )
        == 0
    )
    cli_result = json.loads(capsys.readouterr().out)
    assert cli_result == {"queue": predictor_result.queue, "priority": predictor_result.priority}


def test_predictor_rejects_empty_body(smoke_training):
    config, _ = smoke_training
    with pytest.raises(ValueError, match="body"):
        TicketPredictor.load(config.artifact_dir).predict("subject", "")
