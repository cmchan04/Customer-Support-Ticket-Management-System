# Archived subject-weighting experiment

Status: retired on 19 August 2026. It is not available through the `ticket-ml`
CLI and is not included in `TrainingConfig`.

## What was tested

The experiment trained two independent word-and-character TF-IDF Linear SVM
pipelines. It kept the body weight at 1 and tried subject weights of 1, 2, 3,
and 4. Five-fold cross-validation selected 1:1 for both queue and priority.

## Why it was retired

Increasing subject emphasis made the cross-validation scores lower for every
tested ratio. The selected 1:1 pipeline did not add useful weighting, and its
word-and-character features made queue performance worse than the simpler
text-only baseline.

| Target | Text-only baseline accuracy | Retired experiment accuracy | Decision |
| --- | ---: | ---: | --- |
| Queue | 74.27% | 73.90% | Worse by 0.37 percentage points |
| Priority | 75.46% | 75.61% | Only +0.15 points; not a meaningful gain |

The active joint type-aware model is substantially better: 78.06% queue
accuracy and 80.26% priority accuracy. Its reports are in
`resources/model_output/joint_type_experiment/`.

## Archive contents

- `disabled_training_code.py.disabled` is a commented source snapshot. It is
  documentation only and cannot be imported or run.
- `artifacts/archive/subject_weighting/models/` contains the two retired Joblib
  pipelines.
- `artifacts/archive/subject_weighting/reports/` contains the associated plots,
  metrics, classification reports, and error-analysis CSV files.

The model binaries remain Git-ignored because they are generated artifacts.
