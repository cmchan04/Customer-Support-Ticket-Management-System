"""Safe promotion of validated model experiments into fixed deployment paths."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


class ModelPromotionError(RuntimeError):
    """Raised when a model promotion cannot be completed safely."""


@dataclass(frozen=True)
class ModelPromotionResult:
    """Record of one family promoted into the fixed deployment directory."""

    family: str
    training_method: str
    source_directory: Path
    destination_directory: Path
    archive_directory: Path
    model_version: str
    files: tuple[str, ...]

    def as_dict(self) -> dict[str, Any]:
        return {
            "family": self.family,
            "training_method": self.training_method,
            "source_directory": str(self.source_directory),
            "destination_directory": str(self.destination_directory),
            "archive_directory": str(self.archive_directory),
            "model_version": self.model_version,
            "files": list(self.files),
        }


_REQUIRED_FILES: dict[str, tuple[str, ...]] = {
    "separate": ("queue_pipeline.joblib", "priority_pipeline.joblib", "metadata.json"),
    "joint": ("joint_pipeline.joblib", "metadata.json"),
}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _read_metadata(directory: Path) -> dict[str, Any]:
    metadata_path = directory / "metadata.json"
    try:
        return json.loads(metadata_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ModelPromotionError(f"Invalid model metadata: {metadata_path}") from exc


def _require_files(directory: Path, family: str) -> tuple[str, ...]:
    if not directory.is_dir():
        raise ModelPromotionError(f"Model source directory does not exist: {directory}")
    required = _REQUIRED_FILES[family]
    missing = [name for name in required if not (directory / name).is_file()]
    if missing:
        raise ModelPromotionError(
            f"{family} model source is missing required files: {', '.join(missing)}"
        )
    return required


def _training_method(metadata: dict[str, Any], family: str) -> str:
    results = metadata.get("results", {})
    method = results.get("selected_model")
    if method:
        return str(method)
    if family == "separate":
        queue = results.get("queue", {})
        priority = results.get("priority", {})
        return f"{queue.get('selected_model', 'queue')}_and_{priority.get('selected_model', 'priority')}"
    return "joint_model"


def _safe_version_slug(metadata: dict[str, Any], family: str) -> str:
    trained_at = str(metadata.get("trained_at_utc") or "unknown")
    try:
        parsed = datetime.fromisoformat(trained_at.replace("Z", "+00:00"))
        stamp = parsed.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")
    except ValueError:
        stamp = "unknown"
    method = _training_method(metadata, family)
    method_slug = "".join(character if character.isalnum() else "_" for character in method)
    return f"pre_merge_{stamp}_{family}_{method_slug}"


def _unique_archive_directory(
    archive_root: Path,
    family: str,
    metadata: dict[str, Any],
    promotion_stamp: str,
) -> Path:
    base = archive_root / family / _safe_version_slug(metadata, family)
    if not base.exists():
        return base
    return base.with_name(f"{base.name}_{promotion_stamp}")


def _archive_files(
    source_directory: Path,
    archive_directory: Path,
    files: tuple[str, ...],
) -> dict[str, str]:
    archive_directory.mkdir(parents=True, exist_ok=False)
    hashes: dict[str, str] = {}
    for name in files:
        source = source_directory / name
        destination = archive_directory / name
        shutil.copy2(source, destination)
        source_hash = _sha256(source)
        if _sha256(destination) != source_hash:
            raise ModelPromotionError(f"Archive verification failed for {source}")
        hashes[name] = source_hash
    return hashes


def _atomic_copy(source: Path, destination: Path) -> None:
    temporary = destination.with_name(f".{destination.name}.{uuid.uuid4().hex}.tmp")
    try:
        shutil.copy2(source, temporary)
        if _sha256(source) != _sha256(temporary):
            raise ModelPromotionError(f"Promotion verification failed for {source}")
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def _deployed_metadata(
    source_metadata: dict[str, Any],
    *,
    family: str,
    training_method: str,
    source_directory: Path,
    destination_directory: Path,
    archive_directory: Path,
    promoted_at_utc: str,
) -> dict[str, Any]:
    metadata = json.loads(json.dumps(source_metadata))
    results = metadata.setdefault("results", {})
    results["artifact_dir"] = str(destination_directory.resolve())
    metadata["deployment"] = {
        "status": "fixed_deployment",
        "family": family,
        "training_method": training_method,
        "promoted_at_utc": promoted_at_utc,
        "promoted_from": str(source_directory.resolve()),
        "archived_previous_artifact": str(archive_directory.resolve()),
    }
    return metadata


def promote_merged_models(
    *,
    model_root: Path,
    separate_source: Path | None = None,
    joint_source: Path | None = None,
    archive_root: Path | None = None,
    now: datetime | None = None,
) -> tuple[ModelPromotionResult, ...]:
    """Archive current fixed artifacts and promote both merged experiments.

    Existing files are copied and hash-verified into family-specific archive
    directories before any production file is replaced. New metadata records
    its experiment source and the archived predecessor for traceability.
    """

    model_root = Path(model_root).resolve()
    separate_source = Path(
        separate_source or model_root / "experiments" / "merge_it_technical"
    ).resolve()
    joint_source = Path(
        joint_source or model_root / "experiments" / "merge_it_technical_joint"
    ).resolve()
    # Keep every archive in the workspace-level archive directory so retired
    # experiments and previous production artifacts have one predictable home.
    # ``model_root`` is normally ``<workspace>/artifacts/models``.
    archive_root = Path(
        archive_root or model_root.parent.parent / "archive" / "model_deployment"
    ).resolve()
    promotion_time = (now or datetime.now(UTC)).astimezone(UTC)
    promotion_stamp = promotion_time.strftime("%Y%m%dT%H%M%SZ")
    promoted_at_utc = promotion_time.isoformat()

    requests = (
        ("separate", separate_source, model_root),
        ("joint", joint_source, model_root / "joint"),
    )
    prepared: list[tuple[str, Path, Path, tuple[str, ...], dict[str, Any], dict[str, Any]]] = []
    for family, source, destination in requests:
        source_files = _require_files(source, family)
        source_metadata = _read_metadata(source)
        queue_label_map = source_metadata.get("config", {}).get("queue_label_map", {})
        if queue_label_map != {"IT Support": "Technical Support"}:
            raise ModelPromotionError(
                f"{family} source is not the validated IT/Technical merge experiment: {source}"
            )
        destination_files = tuple(name for name in source_files if (destination / name).is_file())
        previous_metadata = _read_metadata(destination) if "metadata.json" in destination_files else {}
        prepared.append(
            (family, source, destination, source_files, source_metadata, previous_metadata)
        )

    results: list[ModelPromotionResult] = []
    for family, source, destination, files, source_metadata, previous_metadata in prepared:
        training_method = _training_method(source_metadata, family)
        archive_directory = _unique_archive_directory(
            archive_root, family, previous_metadata, promotion_stamp
        )
        old_hashes: dict[str, str] = {}
        if destination.exists():
            previous_files = tuple(name for name in files if (destination / name).is_file())
            if previous_files:
                old_hashes = _archive_files(destination, archive_directory, previous_files)
            else:
                archive_directory.mkdir(parents=True, exist_ok=False)
        else:
            archive_directory.mkdir(parents=True, exist_ok=False)

        destination.mkdir(parents=True, exist_ok=True)
        deployed_metadata = _deployed_metadata(
            source_metadata,
            family=family,
            training_method=training_method,
            source_directory=source,
            destination_directory=destination,
            archive_directory=archive_directory,
            promoted_at_utc=promoted_at_utc,
        )
        for name in files:
            if name == "metadata.json":
                temporary = destination / f".metadata.{uuid.uuid4().hex}.tmp"
                try:
                    temporary.write_text(
                        json.dumps(deployed_metadata, indent=2, sort_keys=True) + "\n",
                        encoding="utf-8",
                    )
                    os.replace(temporary, destination / name)
                finally:
                    temporary.unlink(missing_ok=True)
            else:
                _atomic_copy(source / name, destination / name)

        manifest = {
            "family": family,
            "archived_previous_files": old_hashes,
            "promoted_source": str(source),
            "promoted_destination": str(destination),
            "promoted_at_utc": promoted_at_utc,
            "training_method": training_method,
            "model_version": str(source_metadata.get("trained_at_utc") or "local-artifact"),
        }
        (archive_directory / "promotion_manifest.json").write_text(
            json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        results.append(
            ModelPromotionResult(
                family=family,
                training_method=training_method,
                source_directory=source,
                destination_directory=destination,
                archive_directory=archive_directory,
                model_version=str(source_metadata.get("trained_at_utc") or "local-artifact"),
                files=files,
            )
        )
    return tuple(results)
