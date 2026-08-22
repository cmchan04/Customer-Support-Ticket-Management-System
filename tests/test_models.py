from __future__ import annotations

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC

from ticket_ml.models import CalibratedSVMClassifier, TicketTypeRouterClassifier
from ticket_ml.text import TicketTextPreprocessor


def test_ticket_type_router_routes_known_types_and_falls_back_for_unknown():
    frame = pd.DataFrame(
        {
            "subject": [
                "billing payment",
                "billing invoice",
                "billing refund",
                "technical server",
                "technical login",
                "technical outage",
            ],
            "body": [
                "billing payment problem",
                "billing invoice question",
                "billing refund request",
                "technical server problem",
                "technical login problem",
                "technical outage report",
            ],
            "type": ["Request", "Request", "Request", "Incident", "Incident", "Incident"],
        }
    )
    target = pd.Series(["Billing", "Billing", "Billing", "Technical", "Technical", "Technical"])
    base = Pipeline(
        [
            ("text", TicketTextPreprocessor()),
            ("tfidf", TfidfVectorizer(ngram_range=(1, 2))),
            ("classifier", LinearSVC(class_weight="balanced", random_state=29)),
        ]
    )
    router = TicketTypeRouterClassifier(base).fit(frame, target)

    predictions = router.predict(frame.assign(type=["Request", "Request", "Unknown", "Incident", "Incident", "Incident"]))
    assert len(predictions) == len(frame)
    assert set(predictions) <= {"Billing", "Technical"}
    assert router.decision_function(frame).shape == (len(frame), 2)


def test_ticket_type_router_can_fit_out_of_fold_decision_biases():
    frame = pd.DataFrame(
        {
            "subject": [
                "billing payment",
                "technical server",
                "billing invoice",
                "technical login",
                "billing refund",
                "technical outage",
                "billing charge",
                "technical network",
            ],
            "body": [
                "billing payment problem",
                "technical server problem",
                "billing invoice question",
                "technical login problem",
                "billing refund request",
                "technical outage report",
                "billing charge question",
                "technical network report",
            ],
            "type": [
                "Request",
                "Request",
                "Request",
                "Request",
                "Incident",
                "Incident",
                "Incident",
                "Incident",
            ],
        }
    )
    target = pd.Series(
        ["Billing", "Technical", "Billing", "Technical", "Billing", "Technical", "Billing", "Technical"]
    )
    base = Pipeline(
        [
            ("text", TicketTextPreprocessor()),
            ("tfidf", TfidfVectorizer(ngram_range=(1, 2))),
            ("classifier", LinearSVC(class_weight="balanced", random_state=29)),
        ]
    )
    router = TicketTypeRouterClassifier(base).fit(frame, target)

    bias = router.fit_decision_bias(frame, target, cv_folds=2, grid=(0.0, 0.5), passes=1)

    assert bias.shape == (2,)
    assert router.predict(frame).shape == (len(frame),)


def test_ticket_type_router_marginal_joint_prediction_returns_two_labels():
    frame = pd.DataFrame(
        {
            "subject": [
                "billing low",
                "billing medium",
                "billing high",
                "technical low",
                "technical medium",
                "technical high",
            ],
            "body": [
                "billing issue low urgency",
                "billing issue medium urgency",
                "billing issue high urgency",
                "technical issue low urgency",
                "technical issue medium urgency",
                "technical issue high urgency",
            ],
            "type": ["Request", "Request", "Request", "Incident", "Incident", "Incident"],
        }
    )
    target = pd.Series(
        [
            "Billing||low",
            "Billing||medium",
            "Billing||high",
            "Technical||low",
            "Technical||medium",
            "Technical||high",
        ]
    )
    base = Pipeline(
        [
            ("text", TicketTextPreprocessor()),
            ("tfidf", TfidfVectorizer(ngram_range=(1, 2))),
            ("classifier", LinearSVC(class_weight="balanced", random_state=29)),
        ]
    )
    router = TicketTypeRouterClassifier(
        base, decision_mode="marginal", score_temperature=0.25
    ).fit(frame, target)

    predictions = router.predict(frame)

    assert len(predictions) == len(frame)
    assert all("||" in str(value) for value in predictions)


def test_calibrated_svm_returns_probabilities_without_changing_label_predictions():
    features = pd.DataFrame(
        {
            "score": [-3.0, -2.0, -1.0, -0.5, 0.5, 1.0, 2.0, 3.0],
        }
    )
    labels = pd.Series(["Billing", "Billing", "Billing", "Billing", "Technical", "Technical", "Technical", "Technical"])
    calibrated = CalibratedSVMClassifier(
        LinearSVC(class_weight="balanced", random_state=29),
        cv_folds=2,
        random_state=29,
    ).fit(features, labels)

    probabilities = calibrated.predict_proba(features)

    assert calibrated.predict(features).shape == (len(features),)
    assert probabilities.shape == (len(features), 2)
    assert (probabilities >= 0).all()
    assert (probabilities <= 1).all()
    assert (probabilities.sum(axis=1).round(8) == 1).all()
    assert calibrated.calibration_method_ == "sigmoid_calibrated_probability"
