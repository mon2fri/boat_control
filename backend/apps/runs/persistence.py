from __future__ import annotations

import json
import tempfile
import threading
import uuid
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from django.conf import settings

from apps.runs.services import ExecutionResult
from apps.settings.services import get_run_history_dir

_runs_lock = threading.Lock()


def _results_dir() -> Path:
    directory = get_run_history_dir()
    directory.mkdir(parents=True, exist_ok=True)
    return directory


@dataclass(frozen=True)
class RunMetadata:
    run_id: str
    report_name: str
    file_a_name: str
    file_b_name: str
    created_at: str
    file_path: str


@dataclass(frozen=True)
class RunsIndex:
    runs: list[RunMetadata]


def _generate_run_id() -> str:
    return uuid.uuid4().hex[:12]


def _sanitize_report_name(name: str) -> str:
    cleaned = "".join(c if c.isalnum() or c in ("-", "_", " ") else "_" for c in name)
    return cleaned.strip()[:200] or "unnamed_run"


def _default_report_name(file_a_name: str, file_b_name: str) -> str:
    a_stem = Path(file_a_name).stem
    b_stem = Path(file_b_name).stem
    return f"{a_stem}_vs_{b_stem}"


def _load_index() -> RunsIndex:
    index_path = _results_dir() / "index.json"
    if not index_path.exists():
        return RunsIndex(runs=[])

    with open(index_path) as f:
        data = json.load(f)

    runs = [
        RunMetadata(
            run_id=r["run_id"],
            report_name=r["report_name"],
            file_a_name=r["file_a_name"],
            file_b_name=r["file_b_name"],
            created_at=r["created_at"],
            file_path=r["file_path"],
        )
        for r in data.get("runs", [])
    ]
    return RunsIndex(runs=runs)


def _save_index(index: RunsIndex) -> None:
    results_dir = _results_dir()
    index_path = results_dir / "index.json"
    data = {
        "runs": [
            {
                "run_id": r.run_id,
                "report_name": r.report_name,
                "file_a_name": r.file_a_name,
                "file_b_name": r.file_b_name,
                "created_at": r.created_at,
                "file_path": r.file_path,
            }
            for r in index.runs
        ]
    }

    with tempfile.NamedTemporaryFile(
        mode="w", dir=results_dir, delete=False, suffix=".json"
    ) as tmp:
        json.dump(data, tmp, indent=2)
        tmp_path = Path(tmp.name)

    tmp_path.replace(index_path)


def save_run(
    result: ExecutionResult,
    file_a_name: str,
    file_b_name: str,
    report_name: str | None = None,
    file_a_path: Path | None = None,
    file_b_path: Path | None = None,
) -> RunMetadata:
    expired_upload_paths: list[Path] = []
    with _runs_lock:
        run_id = _generate_run_id()
        effective_name = report_name or _default_report_name(file_a_name, file_b_name)
        safe_name = _sanitize_report_name(effective_name)

        run_data: dict[str, Any] = {
            "run_id": run_id,
            "report_name": effective_name,
            "file_a_name": file_a_name,
            "file_b_name": file_b_name,
            "created_at": datetime.now(UTC).isoformat(),
            "upload_refs": list(
                dict.fromkeys(
                    path.name
                    for path in (file_a_path, file_b_path)
                    if path is not None
                )
            ),
            "result": {
                "comparison": asdict(result.comparison),
                "validation": {
                    "total_violations": result.validation.total_violations,
                    "distinct_violating_rows": result.validation.distinct_violating_rows,
                    "distinct_violating_attributes": (
                        result.validation.distinct_violating_attributes
                    ),
                    "violations_by_rule": {
                        k: [asdict(v) for v in violations]
                        for k, violations in result.validation.violations_by_rule.items()
                    },
                    "violation_count_by_rule": result.validation.violation_count_by_rule,
                    "violating_rows_by_rule": result.validation.violating_rows_by_rule,
                    "violating_attributes_by_rule": result.validation.violating_attributes_by_rule,
                    "rule_summaries": result.validation.rule_summaries,
                },
                "common_columns": result.common_columns,
                "target_columns": result.target_columns,
                "key_columns": result.key_columns,
                "filters_applied": result.filters_applied,
                "grouping_columns": result.grouping_columns,
                "group_statistics": result.group_statistics,
            },
        }

        file_name = f"{run_id}_{safe_name}.json"
        results_dir = _results_dir()
        file_path = results_dir / file_name

        with tempfile.NamedTemporaryFile(
            mode="w", dir=results_dir, delete=False, suffix=".json"
        ) as tmp:
            json.dump(run_data, tmp, indent=2)
            tmp_path = Path(tmp.name)

        tmp_path.replace(file_path)

        metadata = RunMetadata(
            run_id=run_id,
            report_name=effective_name,
            file_a_name=file_a_name,
            file_b_name=file_b_name,
            created_at=run_data["created_at"],
            file_path=str(file_path),
        )

        index = _load_index()
        index.runs.append(metadata)
        expired = _enforce_retention(index)
        for old_meta in expired:
            expired_upload_paths.extend(_upload_paths_for_metadata(old_meta))
            Path(old_meta.file_path).unlink(missing_ok=True)
        _save_index(index)

    _cleanup_upload_paths(expired_upload_paths)
    return metadata


def _enforce_retention(index: RunsIndex) -> list[RunMetadata]:
    expired: list[RunMetadata] = []
    max_runs = settings.DEFAULT_RUN_RETENTION
    while len(index.runs) > max_runs:
        expired.append(index.runs.pop(0))
    return expired


def rename_run(run_id: str, new_report_name: str) -> RunMetadata:
    with _runs_lock:
        index = _load_index()
        for i, meta in enumerate(index.runs):
            if meta.run_id == run_id:
                safe_name = _sanitize_report_name(new_report_name)
                old_path = Path(meta.file_path)
                new_file_name = f"{run_id}_{safe_name}.json"
                new_path = _results_dir() / new_file_name

                if old_path.exists():
                    if old_path != new_path:
                        old_path.rename(new_path)
                    with open(new_path) as f:
                        body = json.load(f)
                    body["report_name"] = new_report_name
                    with open(new_path, "w") as f:
                        json.dump(body, f, indent=2)

                updated = RunMetadata(
                    run_id=meta.run_id,
                    report_name=new_report_name,
                    file_a_name=meta.file_a_name,
                    file_b_name=meta.file_b_name,
                    created_at=meta.created_at,
                    file_path=str(new_path),
                )
                index.runs[i] = updated
                _save_index(index)
                return updated

        raise ValueError(f"Run {run_id} not found.")


def load_run(run_id: str) -> dict[str, Any] | None:
    index = _load_index()
    for meta in index.runs:
        if meta.run_id == run_id:
            file_path = Path(meta.file_path)
            if file_path.exists():
                with open(file_path) as f:
                    data: dict[str, Any] = json.load(f)
                    # Backward compatibility: default missing grouping fields
                    result = data.get("result", {})
                    if "grouping_columns" not in result:
                        result["grouping_columns"] = []
                    if "group_statistics" not in result:
                        result["group_statistics"] = None
                    if "filters_applied" not in result:
                        result["filters_applied"] = []
                    return data
            return None
    return None


def list_runs() -> list[RunMetadata]:
    index = _load_index()
    return list(reversed(index.runs))


def _upload_paths_for_metadata(metadata: RunMetadata) -> list[Path]:
    result_path = Path(metadata.file_path)
    if not result_path.exists():
        return []
    try:
        with open(result_path) as file:
            data = json.load(file)
    except (OSError, json.JSONDecodeError):
        return []
    refs = data.get("upload_refs", [])
    if isinstance(refs, list):
        return [
            Path(settings.UPLOADS_DIR) / ref
            for ref in refs
            if isinstance(ref, str) and Path(ref).name == ref
        ]
    # Compatibility with documents written during early development.
    paths = data.get("upload_paths", [])
    if not isinstance(paths, list):
        return []
    return [Path(path) for path in paths if isinstance(path, str)]


def upload_is_referenced(path: Path) -> bool:
    normalized = path.resolve()
    with _runs_lock:
        index = _load_index()
        return any(
            normalized == candidate.resolve()
            for metadata in index.runs
            for candidate in _upload_paths_for_metadata(metadata)
        )


def _cleanup_upload_paths(paths: list[Path]) -> None:
    if not paths:
        return
    from apps.files.sessions import remove_upload_if_unreferenced

    for path in set(paths):
        remove_upload_if_unreferenced(path)


def delete_run(run_id: str) -> None:
    released_paths: list[Path] = []
    with _runs_lock:
        index = _load_index()
        for position, metadata in enumerate(index.runs):
            if metadata.run_id != run_id:
                continue
            released_paths = _upload_paths_for_metadata(metadata)
            Path(metadata.file_path).unlink(missing_ok=True)
            index.runs.pop(position)
            _save_index(index)
            break
        else:
            raise ValueError(f"Run {run_id} not found.")
    _cleanup_upload_paths(released_paths)
