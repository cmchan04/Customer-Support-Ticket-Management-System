"""Reusable estimators used by the ticket training and prediction pipelines."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, ClassifierMixin, clone
from sklearn.metrics import f1_score
from sklearn.model_selection import StratifiedKFold


class TicketTypeRouterClassifier(BaseEstimator, ClassifierMixin):
    """Route each ticket to a classifier trained for its ticket type.

    ``base_estimator`` is normally a complete text pipeline.  The estimator is
    cloned once for every type and once as a global fallback.  Routing happens
    before the base pipeline transforms the data, so the type column remains
    available while every vectorizer is still fitted only on the current
    training fold.  Unknown types and one-class type subsets use the fallback.
    """

    def __init__(
        self,
        base_estimator: Any,
        *,
        type_column: str = "type",
        class_weight_power: float = 1.0,
        decision_mode: str = "argmax",
        score_temperature: float = 0.25,
    ) -> None:
        self.base_estimator = base_estimator
        self.type_column = type_column
        self.class_weight_power = class_weight_power
        self.decision_mode = decision_mode
        self.score_temperature = score_temperature

    def fit(self, x: pd.DataFrame, y: Any) -> TicketTypeRouterClassifier:
        self._validate_input(x)
        labels = np.asarray(y)
        if len(labels) != len(x):
            raise ValueError("Feature and target lengths must match.")
        if len(labels) == 0:
            raise ValueError("At least one training row is required.")
        class_weight_power = getattr(self, "class_weight_power", 1.0)
        if class_weight_power < 0:
            raise ValueError("class_weight_power must not be negative.")
        decision_mode = getattr(self, "decision_mode", "argmax")
        if decision_mode not in {"argmax", "marginal"}:
            raise ValueError("decision_mode must be 'argmax' or 'marginal'.")
        score_temperature = getattr(self, "score_temperature", 0.25)
        if score_temperature <= 0:
            raise ValueError("score_temperature must be greater than zero.")

        self.classes_ = np.unique(labels)
        self.fallback_estimator_ = clone(self.base_estimator)
        self._fit_estimator(self.fallback_estimator_, x, labels)
        self.estimators_: dict[str, Any] = {}

        type_values = self._normalise_types(x[self.type_column])
        for type_value in sorted(set(type_values)):
            mask = type_values == type_value
            type_labels = labels[mask]
            # A linear classifier cannot fit a one-class subset.  Routing to
            # the global model is safer than inventing a constant prediction.
            if len(np.unique(type_labels)) < 2:
                continue
            estimator = clone(self.base_estimator)
            self._fit_estimator(estimator, x.loc[mask], type_labels)
            self.estimators_[type_value] = estimator
        return self

    def predict(self, x: pd.DataFrame) -> np.ndarray:
        self._validate_fitted()
        self._validate_input(x)
        if (
            getattr(self, "decision_mode", "argmax") == "marginal"
            and all("||" in str(label) for label in self.classes_)
        ):
            return self._predict_joint_marginal(x)
        if hasattr(self, "decision_bias_"):
            scores = self.decision_function(x)
            return self.classes_[np.argmax(scores, axis=1)]
        predictions = np.empty(len(x), dtype=object)
        for indices, estimator in self._group_estimators(x):
            predictions[indices] = estimator.predict(x.iloc[indices])
        return predictions

    def _predict_joint_marginal(self, x: pd.DataFrame) -> np.ndarray:
        """Predict queue and priority from separate joint-score marginals.

        A joint Linear SVM produces a score for each queue/priority
        combination.  The default ``argmax`` mode returns the single highest
        scoring combination.  Marginal mode converts the scores to a
        temperature-scaled softmax within each routed type, sums probability
        mass separately by queue and priority, and returns the two independent
        winners as a reversible ``queue||priority`` string.
        """
        raw_scores = self._raw_decision_function(x)
        temperature = float(getattr(self, "score_temperature", 0.25))
        joint_queues = np.asarray([str(label).split("||", 1)[0] for label in self.classes_])
        joint_priorities = np.asarray([str(label).split("||", 1)[1] for label in self.classes_])
        queue_labels = np.unique(joint_queues)
        priority_labels = np.unique(joint_priorities)
        predictions: list[str] = []
        for row in raw_scores:
            finite = np.isfinite(row)
            if not bool(finite.any()):
                raise ValueError("Joint classifier returned no finite decision scores.")
            values = row[finite] / temperature
            values -= np.max(values)
            probabilities = np.exp(values)
            probabilities /= probabilities.sum()
            available_queues = joint_queues[finite]
            available_priorities = joint_priorities[finite]
            queue_scores = np.asarray(
                [probabilities[available_queues == label].sum() for label in queue_labels]
            )
            priority_scores = np.asarray(
                [probabilities[available_priorities == label].sum() for label in priority_labels]
            )
            queue = str(queue_labels[int(np.argmax(queue_scores))])
            priority = str(priority_labels[int(np.argmax(priority_scores))])
            predictions.append(f"{queue}||{priority}")
        return np.asarray(predictions, dtype=object)

    def decision_function(self, x: pd.DataFrame) -> np.ndarray:
        scores = self._raw_decision_function(x)
        if hasattr(self, "decision_bias_"):
            scores = scores / self.decision_scale_ + self.decision_bias_
        return scores

    def _raw_decision_function(self, x: pd.DataFrame) -> np.ndarray:
        self._validate_fitted()
        self._validate_input(x)
        scores = np.full((len(x), len(self.classes_)), -np.inf, dtype=float)
        class_indices = {label: index for index, label in enumerate(self.classes_)}
        for indices, estimator in self._group_estimators(x):
            if not hasattr(estimator, "decision_function"):
                raise AttributeError("The routed base estimator has no decision_function.")
            raw_scores = np.asarray(estimator.decision_function(x.iloc[indices]))
            estimator_classes = np.asarray(estimator.classes_)
            if raw_scores.ndim == 1:
                raw_scores = np.column_stack((-raw_scores, raw_scores))
            for local_index, label in enumerate(estimator_classes):
                scores[indices, class_indices[label]] = raw_scores[:, local_index]
        return scores

    def fit_decision_bias(
        self,
        x: pd.DataFrame,
        y: Any,
        *,
        cv_folds: int = 3,
        grid: tuple[float, ...] = (
            -1.5,
            -1.0,
            -0.75,
            -0.5,
            -0.25,
            0.0,
            0.25,
            0.5,
            0.75,
            1.0,
            1.5,
        ),
        passes: int = 3,
        random_state: int = 29,
    ) -> np.ndarray:
        """Fit macro-F1 class offsets from out-of-fold routed scores.

        The routed estimators are already fitted on ``x``.  This method uses
        fresh clones for the internal folds, so the offsets never see the
        labels of the rows they score.  It is intentionally separate from
        ``fit`` because calibration is an optional, target-specific experiment
        and can be expensive for a large text pipeline.
        """
        self._validate_fitted()
        self._validate_input(x)
        if cv_folds < 2:
            raise ValueError("cv_folds must be at least 2 for score calibration.")
        if passes < 1:
            raise ValueError("passes must be at least 1 for score calibration.")

        labels = np.asarray(y)
        if len(labels) != len(x):
            raise ValueError("Feature and target lengths must match.")
        class_indices = {label: index for index, label in enumerate(self.classes_)}
        oof_scores = np.full((len(x), len(self.classes_)), -np.inf, dtype=float)
        type_values = self._normalise_types(x[self.type_column])

        for type_value in sorted(set(type_values)):
            indices = np.flatnonzero(type_values == type_value)
            type_labels = labels[indices]
            if len(np.unique(type_labels)) < 2:
                continue
            minimum_count = int(np.unique(type_labels, return_counts=True)[1].min())
            folds = min(cv_folds, minimum_count)
            if folds < 2:
                continue
            splitter = StratifiedKFold(
                n_splits=folds, shuffle=True, random_state=random_state
            )
            type_features = x.iloc[indices]
            for fit_indices, validation_indices in splitter.split(type_features, type_labels):
                estimator = clone(self.base_estimator)
                self._fit_estimator(
                    estimator,
                    type_features.iloc[fit_indices],
                    type_labels[fit_indices],
                )
                raw_scores = np.asarray(
                    estimator.decision_function(type_features.iloc[validation_indices])
                )
                if raw_scores.ndim == 1:
                    raw_scores = np.column_stack((-raw_scores, raw_scores))
                for local_index, label in enumerate(np.asarray(estimator.classes_)):
                    oof_scores[indices[validation_indices], class_indices[label]] = raw_scores[
                        :, local_index
                    ]

        valid_rows = np.isfinite(oof_scores).all(axis=1)
        if not bool(valid_rows.any()):
            raise ValueError("No complete out-of-fold scores were available for calibration.")
        scale = np.std(oof_scores[valid_rows], axis=0)
        scale[(~np.isfinite(scale)) | (scale < 1e-6)] = 1.0
        normalised_scores = oof_scores[valid_rows] / scale
        valid_labels = labels[valid_rows]
        bias = np.zeros(len(self.classes_), dtype=float)

        def predictions(offsets: np.ndarray) -> np.ndarray:
            return self.classes_[np.argmax(normalised_scores + offsets, axis=1)]

        for _ in range(passes):
            for class_index in range(len(self.classes_)):
                current = f1_score(
                    valid_labels, predictions(bias), average="macro", zero_division=0
                )
                best_score = current
                best_value = bias[class_index]
                for candidate in grid:
                    trial = bias.copy()
                    trial[class_index] = candidate
                    score = f1_score(
                        valid_labels, predictions(trial), average="macro", zero_division=0
                    )
                    if score > best_score + 1e-12:
                        best_score = score
                        best_value = candidate
                bias[class_index] = best_value

        self.decision_scale_ = scale
        self.decision_bias_ = bias
        return bias.copy()

    def _group_estimators(self, x: pd.DataFrame):
        type_values = self._normalise_types(x[self.type_column])
        for type_value in sorted(set(type_values)):
            indices = np.flatnonzero(type_values == type_value)
            estimator = self.estimators_.get(type_value, self.fallback_estimator_)
            yield indices, estimator

    def _validate_fitted(self) -> None:
        if not hasattr(self, "classes_") or not hasattr(self, "fallback_estimator_"):
            raise ValueError("TicketTypeRouterClassifier must be fitted before prediction.")

    def _fit_estimator(self, estimator: Any, x: pd.DataFrame, y: np.ndarray) -> None:
        """Apply a tunable inverse-frequency power to LinearSVC class weights."""
        class_weight_power = getattr(self, "class_weight_power", 1.0)
        if hasattr(estimator, "get_params") and "classifier__class_weight" in estimator.get_params(
            deep=True
        ):
            classes, counts = np.unique(y, return_counts=True)
            if class_weight_power == 0:
                class_weight = None
            else:
                total = len(y)
                class_weight = {
                    label: float((total / (len(classes) * count)) ** class_weight_power)
                    for label, count in zip(classes, counts, strict=True)
                }
            estimator.set_params(classifier__class_weight=class_weight)
        estimator.fit(x, y)

    def _validate_input(self, x: pd.DataFrame) -> None:
        if not isinstance(x, pd.DataFrame):
            raise TypeError("TicketTypeRouterClassifier requires a pandas DataFrame.")
        if self.type_column not in x.columns:
            raise ValueError(f"Missing type column: {self.type_column}")

    @staticmethod
    def _normalise_types(values: pd.Series) -> np.ndarray:
        return values.fillna("Unknown").astype(str).replace("", "Unknown").to_numpy()
