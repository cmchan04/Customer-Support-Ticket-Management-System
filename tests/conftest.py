from __future__ import annotations

from pathlib import Path

import pandas as pd
import pytest

from ticket_ml.config import TrainingConfig
from ticket_ml.training import TrainingRunSummary, train_all


def write_smoke_dataset(path: Path) -> None:
    rows = []
    for queue in ("Billing", "Technical"):
        for priority in ("low", "medium", "high"):
            for index in range(5):
                rows.append(
                    {
                        "subject": f"{queue} {priority} request {index}",
                        "body": f"Customer reports {queue.lower()} issue with {priority} urgency sample {index}.",
                        "answer": "sample answer",
                        "type": "Incident",
                        "queue": queue,
                        "priority": priority,
                        "language": "en",
                    }
                )
    pd.DataFrame(rows).to_csv(path, index=False)


@pytest.fixture(scope="session")
def smoke_training(
    tmp_path_factory: pytest.TempPathFactory,
) -> tuple[TrainingConfig, TrainingRunSummary]:
    root = tmp_path_factory.mktemp("training")
    dataset_path = root / "smoke.csv"
    write_smoke_dataset(dataset_path)
    config = TrainingConfig(
        dataset_path=dataset_path,
        artifact_dir=root / "models",
        report_dir=root / "reports",
        cache_dir=root / "cache",
        cv_folds=2,
        n_jobs=1,
        ngram_ranges=((1, 1),),
        min_dfs=(1,),
        max_dfs=(1.0,),
        logistic_c=(1.0,),
        svm_c=(1.0,),
        nb_alpha=(1.0,),
    )
    return config, train_all(config)
