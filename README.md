# Customer Support Ticket Management System - Chan Chun Ming TP068983

This repository contains the English customer-support ticket classification and
priority-prediction pipeline for Final Year Project. It includes a text-only baseline and
an multiple experiments model that also accepts a customer-selected ticket type.

## Prerequisites and one-time setup

Run all commands below from the project root:

```powershell
cd "E:\APU\FYP_TP068983"
```

Create a virtual environment once, then activate it:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
```

If PowerShell prevents activation, run this command once in the same PowerShell
window and then activate the environment again:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

Install the project and all development/training dependencies:

```powershell
python -m pip install --upgrade pip
python -m pip install -e ".[dev]"
```

Download the NLTK text-processing resources once:

```powershell
ticket-ml setup-nltk
```

The application never installs packages or downloads NLTK data while making a
prediction.

## Dataset metadata

Training reads `resources/data/aa_dataset-tickets-multi-lang-5-2-50-version.csv`. 
This is from open-source platform Hugging Face, which can access with the link: https://huggingface.co/datasets/Tobi-Bueck/customer-support-tickets
The following counts are from the current validated training dataset after
filtering to English, filling missing subjects with an empty string, removing
invalid text/target rows, and deduplicating identical ticket text.

| Item | Count |
| --- | ---: |
| Source CSV rows | 28,587 |
| English validated rows used for training | 16,338 |
| Queue classes | 10 |
| Priority classes | 3 |
| Ticket type classes | 4 |
| Missing subjects treated as empty text | 2,607 |
| Rows removed as duplicate ticket text | 0 |

### Queue distribution

| Queue | Tickets |
| --- | ---: |
| Billing and Payments | 1,595 |
| Customer Service | 2,410 |
| General Inquiry | 236 |
| Human Resources | 348 |
| IT Support | 1,942 |
| Product Support | 3,073 |
| Returns and Exchanges | 820 |
| Sales and Pre-Sales | 513 |
| Service Outages and Maintenance | 664 |
| Technical Support | 4,737 |

### Priority distribution

| Priority | Tickets |
| --- | ---: |
| High | 6,346 |
| Medium | 6,618 |
| Low | 3,374 |

### Ticket type distribution

| Ticket type | Tickets |
| --- | ---: |
| Incident | 6,571 |
| Request | 4,665 |
| Problem | 3,397 |
| Change | 1,705 |

## Commands

Activate the virtual environment before running the commands in this section:

```powershell
.\.venv\Scripts\Activate.ps1
```

Run exploratory data analysis (EDA):

```powershell
ticket-ml eda --config configs\training.toml
```

Train and evaluate all candidate models. This compares Logistic Regression,
Multinomial Naive Bayes, global and type-aware Linear SVMs, Decision Tree, and
CPU-based XGBoost separately for `queue` and `priority` (Note: This might take quite long time
based on your CPU specification):

```powershell
ticket-ml train --config configs\training.toml
```


Run the ticket-type experiment. It uses the customer-selected `Incident`,
`Request`, `Problem`, or `Change` value, searches type weight, SVM C, and word
ngram settings, and writes separate artifacts:

```powershell
ticket-ml tune-type --config configs\training.toml
```

The reports are written to `resources/model_output/type_experiment/` and the
experimental pipelines to `artifacts/models/experiments/type_svm/`. The
standard models are not replaced until the result has been reviewed.

The latest seed-29 type experiment selected `C=10`, 1--3 word grams, and a
type weight of 3 for queue; it selected `C=10`, 1--3 word grams, and a type
weight of 1 for priority. Holdout accuracy was 74.51% for queue and 75.92% for
priority, compared with 74.27% and 75.46% for the comparable text-only SVM.
This is a modest improvement, not an 80% result.

For an explicit categorical representation, test a one-hot `type` feature with
its own weight relative to the TF-IDF text features:

```powershell
ticket-ml tune-type-onehot --config configs\training.toml
```

This writes reports to `resources/model_output/type_onehot_experiment/` and
pipelines to `artifacts/models/experiments/type_onehot/`.

The one-hot search selected a type-feature weight of 0.25 for queue and 0.5
for priority, both with `C=10`. Holdout accuracy was 74.33% for queue and
75.43% for priority, so the explicit one-hot representation does not improve
on the text-only or token-weighted type models.

For a routed type-aware model, train one shared TF-IDF vocabulary and one
Linear SVM per known ticket type, with a global fallback for unknown types:

```powershell
ticket-ml tune-type-router --config configs\training.toml
```

The reports are written to `resources/model_output/type_router_experiment/`
and the isolated pipelines to `artifacts/models/experiments/type_router/`.
The latest five-fold seed-29 search selected `C=30` for both targets, with
1--3 word grams, type weight 1, and class-weight powers 0.5 (queue) and 1.0
(priority). Queue additionally uses out-of-fold macro-F1 decision calibration.
Holdout performance was 76.96% queue accuracy (78.90% macro F1) and 78.58%
priority accuracy (78.19% macro F1); high-priority recall was 81.02%. This is
the strongest validated
type-aware experiment so far, but it still does not reach 80% on both targets.

Use the routed artifacts like this:

```powershell
ticket-ml predict --model-dir artifacts\models\experiments\type_router --ticket-type Incident --subject "Account outage" --body "I cannot access my account after the service interruption."
```

For the strongest type-aware formulation tested so far, run the optional joint
experiment. It trains type-routed classifiers for a reversible
`queue||priority` label, then uses temperature-scaled marginal scores to choose
queue and priority independently. Selection is performed by five-fold
training-set cross-validation; the untouched holdout is evaluated only after
selection:

```powershell
ticket-ml tune-joint-type --config configs\training.toml
```

This writes the deployable joint pipeline and its metadata to its own model
directory, separate from both experiments and the separate queue/priority
pipelines:

```text
artifacts/models/joint/joint_pipeline.joblib
artifacts/models/joint/metadata.json
```

The queue and priority reports, confusion matrices, ROC/PR plot, and
misclassification CSVs are written to
`resources/model_output/joint_type_experiment/`. Use the joint artifact by
pointing the prediction command at that directory:

```powershell
ticket-ml predict --model-dir artifacts\models\joint --ticket-type Incident --subject "Account outage" --body "I cannot access my account after the service interruption."
```

### IT Support + Technical Support merge experiment

To test whether the two technical queues are easier to classify as one
operational destination, run the isolated merge experiment:

```powershell
ticket-ml tune-merge-it-technical --config configs\training.toml
```

The source CSV remains unchanged, while the promoted deployment and database
queue taxonomy now map `IT Support` to `Technical Support`. Reports are written to
`resources/model_output/merge_it_technical_experiment/` and the experimental
pipelines to `artifacts/models/experiments/merge_it_technical/`.

The resulting queue target has nine classes. Compare its queue macro F1,
per-class recall, and confusion matrix with the current ten-class experiment
before considering an operational queue change. The completed seed-29 run
selected `linear_svm_by_type` for both targets:

| Target | Existing ten-class accuracy | Merged accuracy | Existing macro F1 | Merged macro F1 |
| --- | ---: | ---: | ---: | ---: |
| Queue | 76.96% | 81.33% | 78.90% | 81.14% |
| Priority | 78.58% | 79.35% | 78.19% | 78.98% |

The merge substantially improves the unified Technical Support class, but
Product Support recall falls from 72.36% to 69.43%. This trade-off was reviewed
and the merged separate artifact is now the fixed separate deployment. The
original ten-class artifacts remain archived and are not overwritten without a
copy in the archive first.

To test the same label merge with the joint queue-and-priority model, run the
separate isolated command below. It does not overwrite
`artifacts/models/joint/`:

```powershell
ticket-ml tune-merge-it-technical-joint --config configs\training.toml
```

The merged joint artifact is written to
`artifacts/models/experiments/merge_it_technical_joint/`, while its reports are
written to `resources/model_output/merge_it_technical_joint_experiment/`.
This command changes only the in-memory training labels during experimentation;
the source CSV remains unchanged. The validated merged artifact is now deployed
and the database queue migration is available through the command below.

The completed seed-29 run selected `linear_svm_joint_by_type` and produced the
following untouched-holdout comparison with the existing ten-class joint model:

| Target | Existing joint accuracy | Merged joint accuracy | Existing joint macro F1 | Merged joint macro F1 |
| --- | ---: | ---: | ---: | ---: |
| Queue | 78.06% | 81.61% | 79.49% | 81.34% |
| Priority | 80.26% | 80.57% | 79.95% | 80.20% |

Queue accuracy improves by 3.55 percentage points and priority accuracy by
0.31 points. The merged joint artifact is now the fixed joint deployment. The
active family selected for new submissions is still controlled by the Django
deployment record; in the current database, Joint remains active and Separate
remains available as the fixed alternative.


### Promoting and archiving the merged deployments

The promotion command archives the current fixed artifacts by family and
training method before replacing the normal deployment paths:

```powershell
ticket-ml promote-merged-models --model-root artifacts\models --yes
python web\manage.py sync_model_deployments
```

The current production paths are `artifacts/models/` for Separate and
`artifacts/models/joint/` for Joint. All historical material is kept under the
unified workspace archive: retired experiments are in
`archive/subject_weighting/`, while previous fixed deployments are in
`archive/model_deployment/separate/` and
`archive/model_deployment/joint/`. Each deployment archive contains a
`promotion_manifest.json`. Existing tickets keep their original
`model_family`, `model_version`, and prediction record; only future submissions
use the selected active family and the promoted artifacts.

### Interactive terminal menu (Just for testing when UI is still not built)

Open the local menu for prediction and model retraining:

```powershell
ticket-ml menu --config configs\training.toml
```

The menu lets you enter a subject and body, select `Incident`, `Request`,
`Problem`, or `Change`, then choose either the joint model or the separate
queue/priority models. It also offers explicit retraining actions for each
model family. Retraining asks you to type `YES` before overwriting that
family's current saved artifacts.

```text
artifacts/models/
├── queue_pipeline.joblib          # separate queue model
├── priority_pipeline.joblib       # separate priority model
└── joint/
    └── joint_pipeline.joblib      # joint queue + priority model
```

The completed seed-29 run selected type weight 3, `C=10`, 1--4 word grams,
class-weight power 1.0, and score temperature 0.25. On the untouched holdout
it reached 78.06% queue accuracy (79.49% macro F1) and 80.26% priority
accuracy (79.95% macro F1), with 83.94% high-priority recall. This is the
best validated configuration in this repository, but queue and macro recall
remain below an 80% acceptance target; the result must not be described as an
80%-accurate system for both outputs.

The joint model is optional and does not overwrite the ordinary independent
queue and priority pipelines. The deployed form must collect the same
customer-selected type values used during training (`Incident`, `Request`,
`Problem`, or `Change`). If the type is unknown or omitted, the saved model
uses its global fallback classifier.

Predict a queue and priority using the saved models:

```powershell
ticket-ml predict --model-dir artifacts\models --subject "Account outage" --body "I cannot access my account after the service interruption."
```

Include the queue and priority confidence percentages when the selected model
has a probability output. After the calibrated SVM update, retrain the model
first so the saved SVM artifact contains its sigmoid calibration layer:

```powershell
ticket-ml predict --model-dir artifacts\models --ticket-type Incident --subject "Account outage" --body "I cannot access my account after the service interruption." --with-confidence
```

The command returns `queue_confidence_percent` and
`priority_confidence_percent`, each on a 0--100 scale, plus the method used.
For a current calibrated Linear SVM, the method is
`sigmoid_calibrated_probability`. Older Linear SVM artifacts remain valid for
label prediction but report `null` and `unavailable` until they are retrained.
The displayed percentage is a calibrated review signal, not a guarantee that
the prediction is correct.

When using a type-aware model, also pass the customer-selected type:

```powershell
ticket-ml predict --model-dir artifacts\models --ticket-type Incident --subject "Account outage" --body "I cannot access my account after the service interruption."
```

For the isolated type-aware experiment, use its directory as the model
directory:

```powershell
ticket-ml predict --model-dir artifacts\models\experiments\type_svm --ticket-type Incident --subject "Account outage" --body "I cannot access my account after the service interruption."
```

Run the automated tests:

```powershell
pytest -q
```

Run the code-quality checks:

```powershell
ruff check src tests web
```

## Django backend

The database-backed implementation is in [`web/`](web/README.md). It uses
SQLite, Django 5.2, session authentication, role-filtered JSON dashboard
endpoints, the existing fixed Joint/Separate model artifacts, and the
`TicketWorkflow` transition seam. It does not retrain models or expose
rollback from a web request.

Start it with:

```powershell
python -m pip install -e ".[dev]"
python web\manage.py migrate
python web\manage.py seed_demo_data
python web\manage.py sync_model_deployments
python web\manage.py runserver 127.0.0.1:8000
```

Run the backend checks with:

```powershell
python web\manage.py check
python web\manage.py test web.tickets
python -m ruff check src tests web
```

## Training outputs

Training uses an 80/20 train/test split with the configured random seed in
`configs/training.toml`, then uses five-fold stratified cross-validation on the
training portion. Macro F1 selects the best algorithm; the untouched 20% test
portion provides the final reported metrics.

The selected pipelines and reproducibility metadata are written to:

```text
artifacts/models/queue_pipeline.joblib
artifacts/models/priority_pipeline.joblib
artifacts/models/metadata.json
```

Reports, confusion matrices, ROC/precision-recall plots, and misclassification
samples are written to `resources/model_output/`. Training replaces the model
and report files with results from the new run.

