from __future__ import annotations

from ticket_ml.predictor import TicketPredictor


def test_all_candidates_train_and_artifacts_round_trip(smoke_training):
    config, summary = smoke_training

    assert {result["model"] for result in summary.queue.candidate_results} == {
        "logistic_regression",
        "multinomial_naive_bayes",
        "linear_svm",
    }
    assert {result["model"] for result in summary.priority.candidate_results} == {
        "logistic_regression",
        "multinomial_naive_bayes",
        "linear_svm",
    }
    assert (config.artifact_dir / "queue_pipeline.joblib").is_file()
    assert (config.artifact_dir / "priority_pipeline.joblib").is_file()
    assert (config.artifact_dir / "metadata.json").is_file()
    assert (config.report_dir / "metrics.json").is_file()

    predictor = TicketPredictor.load(config.artifact_dir)
    prediction = predictor.predict("Billing high request", "Customer reports a billing issue.")
    assert prediction.queue
    assert prediction.priority in {"low", "medium", "high"}
