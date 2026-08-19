from __future__ import annotations

from dataclasses import replace

from ticket_ml.predictor import TicketPredictor
from ticket_ml.training import tune_joint_type


def test_all_candidates_train_and_artifacts_round_trip(smoke_training):
    config, summary = smoke_training

    assert {result["model"] for result in summary.queue.candidate_results} == {
        "logistic_regression",
        "multinomial_naive_bayes",
        "linear_svm",
        "linear_svm_with_type",
        "linear_svm_by_type",
        "decision_tree",
        "xgboost",
    }
    assert {result["model"] for result in summary.priority.candidate_results} == {
        "logistic_regression",
        "multinomial_naive_bayes",
        "linear_svm",
        "linear_svm_with_type",
        "linear_svm_by_type",
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


def test_joint_type_experiment_round_trips_through_predictor(smoke_training):
    config, _ = smoke_training
    experiment_config = replace(
        config,
        artifact_dir=config.artifact_dir / "joint",
        report_dir=config.report_dir / "joint",
        cache_dir=config.cache_dir / "joint",
        joint_type_weights=(1,),
        joint_c=(1.0,),
        joint_ngram_ranges=((1, 1),),
        joint_max_features=1_000,
        joint_class_weight_powers=(1.0,),
    )

    summary = tune_joint_type(experiment_config)

    assert (summary.artifact_dir / "joint_pipeline.joblib").is_file()
    assert (summary.artifact_dir / "metadata.json").is_file()
    assert (summary.report_dir / "metrics.json").is_file()
    prediction = TicketPredictor.load(summary.artifact_dir).predict(
        "Billing high request", "Customer reports a billing issue.", "Incident"
    )
    assert prediction.queue
    assert prediction.priority in {"low", "medium", "high"}
