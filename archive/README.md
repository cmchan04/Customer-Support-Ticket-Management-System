# Unified archive

This directory is the single home for retired experiments and previous fixed
model deployments. Nothing under this directory is loaded by the running
prediction service.

## Contents

- `subject_weighting/` — the retired subject-weighting source snapshot, saved
  pipelines, reports, plots, and error-analysis files.
- `model_deployment/joint/` — previous Joint production artifacts, grouped by
  promotion and training method.
- `model_deployment/separate/` — previous Separate production artifacts,
  grouped by promotion and training method.

The active, read-only deployment remains in `artifacts/models/` (Separate) and
`artifacts/models/joint/` (Joint). Future promotion commands automatically use
`archive/model_deployment/` unless an explicit `--archive-root` is supplied.
