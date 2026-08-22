from __future__ import annotations

import json
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
    predictor = TicketPredictor.load(summary.artifact_dir)
    prediction = predictor.predict(
        "Billing high request", "Customer reports a billing issue.", "Incident"
    )
    assert prediction.queue
    assert prediction.priority in {"low", "medium", "high"}
    scored_prediction = predictor.predict_scored(
        "Billing high request", "Customer reports a billing issue.", "Incident"
    )
    assert scored_prediction.queue_confidence_method == "sigmoid_calibrated_probability"
    assert scored_prediction.priority_confidence_method == "sigmoid_calibrated_probability"
    assert 0 <= scored_prediction.queue_confidence_percent <= 100
    assert 0 <= scored_prediction.priority_confidence_percent <= 100


def test_joint_type_experiment_supports_isolated_queue_label_merge(smoke_training):
    config, _ = smoke_training
    experiment_root = config.artifact_dir.parent / "merged_joint"
    experiment_config = replace(
        config,
        queue_label_map=(("IT Support", "Technical"),),
        joint_type_weights=(1,),
        joint_c=(1.0,),
        joint_ngram_ranges=((1, 1),),
        joint_max_features=1_000,
        joint_class_weight_powers=(1.0,),
    )

    summary = tune_joint_type(
        experiment_config,
        artifact_dir=experiment_root / "models",
        report_dir=experiment_root / "reports",
        cache_dir=experiment_root / "cache",
    )

    metadata = json.loads((summary.artifact_dir / "metadata.json").read_text())
    assert metadata["config"]["queue_label_map"] == {"IT Support": "Technical"}
    assert (summary.artifact_dir / "joint_pipeline.joblib").is_file()
    assert (summary.report_dir / "metrics.json").is_file()
