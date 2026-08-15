# Customer Support Ticket Management System

This repository contains the English customer-support ticket classification and
priority-prediction pipeline for the FYP. It predicts both fields from a
ticket's `subject` and `body` only.

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
The following counts are from the current validated training dataset after
filtering to English, filling missing subjects with an empty string, removing
invalid text/target rows, and deduplicating identical ticket text.

| Item | Count |
| --- | ---: |
| Source CSV rows | 28,587 |
| English validated rows used for training | 16,338 |
| Queue classes | 10 |
| Priority classes | 3 |
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
Multinomial Naive Bayes, and Linear SVM separately for `queue` and `priority`:

```powershell
ticket-ml train --config configs\training.toml
```

Predict a queue and priority using the saved models:

```powershell
ticket-ml predict --model-dir artifacts\models --subject "Account outage" --body "I cannot access my account after the service interruption."
```

Run the automated tests:

```powershell
pytest -q
```

Run the code-quality checks:

```powershell
ruff check src tests
```

## Training outputs and current result

Training uses an 80/20 train/test split with seed `42`, then uses five-fold
stratified cross-validation on the training portion. Macro F1 selects the best
algorithm; the untouched 20% test portion provides the final reported metrics.

The selected pipelines and reproducibility metadata are written to:

```text
artifacts/models/queue_pipeline.joblib
artifacts/models/priority_pipeline.joblib
artifacts/models/metadata.json
```

Reports, confusion matrices, ROC/precision-recall plots, and misclassification
samples are written to `resources/model_output/`. Training replaces the model
and report files with results from the new run.

The current training run selected Linear SVM for both targets, with word 1--3
grams and `C=10`:

| Target | Holdout accuracy | Macro F1 |
| --- | ---: | ---: |
| Queue | 75.40% | 76.44% |
| Priority | 76.04% | 75.28% |

High-priority recall is 81.02%. The configured 90% accuracy quality gate does
not currently pass, so the result must not be presented as a 90%-accurate
model. Inspect `resources/model_output/metrics.json` to compare every candidate
algorithm's cross-validation and holdout results.
