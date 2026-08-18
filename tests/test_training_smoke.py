from __future__ import annotations

from dataclasses import replace

from ticket_ml.predictor import TicketPredictor
from ticket_ml.training import tune_weighted_svm


def test_all_candidates_train_and_artifacts_round_trip(smoke_training):
    config, summary = smoke_training

    assert {result["model"] for result in summary.queue.candidate_results} == {
        "logistic_regression",
        "multinomial_naive_bayes",
        "linear_svm",
        "decision_tree",
        "xgboost",
    }
    assert {result["model"] for result in summary.priority.candidate_results} == {
        "logistic_regression",
        "multinomial_naive_bayes",
        "linear_svm",
        "decision_tree",
        "xgboost",
    }
    assert (config.artifact_dir / "queue_pipeline.joblib").is_file()
    assert (config.artifact_dir / "priority_pipeline.joblib").is_file()
    assert (config.artifact_dir / "metadata.json").is_file()
    assert (config.report_dir / "metrics.json").is_file()

    predictor = TicketPredictor.load(config.artifact_dir)
    prediction = predictor.predict("Billing high request", "Customer reports a billing issue.")
    assert prediction.queue
    assert prediction.priority in {"low", "medium", "high"}


def test_weighted_svm_experiment_selects_a_subject_weight(smoke_training):
    config, _ = smoke_training
    experiment_config = replace(
        config,
        weighted_svm_subject_weights=(1, 2),
        weighted_svm_character_max_features=1_000,
    )

    summary = tune_weighted_svm(experiment_config)

    assert summary.queue.selected_subject_weight in {1, 2}
    assert summary.priority.selected_subject_weight in {1, 2}
    assert len(summary.queue.candidate_results) == 2
    assert len(summary.priority.candidate_results) == 2
    assert (
        summary.artifact_dir / "queue_weighted_word_character_svm_pipeline.joblib"
    ).is_file()
    assert (summary.report_dir / "metrics.json").is_file()
