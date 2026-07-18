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

_runs_lock = threading.Lock()


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
    index_path = settings.RESULTS_DIR / "index.json"
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
    index_path = settings.RESULTS_DIR / "index.json"
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
        mode="w", dir=settings.RESULTS_DIR, delete=False, suffix=".json"
    ) as tmp:
        json.dump(data, tmp, indent=2)
        tmp_path = Path(tmp.name)

    tmp_path.replace(index_path)


def save_run(
    result: ExecutionResult,
    file_a_name: str,
    file_b_name: str,
    report_name: str | None = None,
) -> RunMetadata:
    with _runs_lock:
        run_id = _generate_run_id()
        effective_name = report_name or _default_report_name(
            file_a_name, file_b_name
        )
        safe_name = _sanitize_report_name(effective_name)

        run_data: dict[str, Any] = {
            "run_id": run_id,
            "report_name": effective_name,
            "file_a_name": file_a_name,
            "file_b_name": file_b_name,
            "created_at": datetime.now(UTC).isoformat(),
            "result": {
                "comparison": asdict(result.comparison),
                "validation": {
                    "total_violations": result.validation.total_violations,
                    "violations_by_rule": {
                        k: [asdict(v) for v in violations]
                        for k, violations in result.validation.violations_by_rule.items()
                    },
                    "violation_count_by_rule": result.validation.violation_count_by_rule,
                },
                "common_columns": result.common_columns,
                "target_columns": result.target_columns,
                "filters_applied": result.filters_applied,
            },
        }

        file_name = f"{run_id}_{safe_name}.json"
        file_path = settings.RESULTS_DIR / file_name

        with tempfile.NamedTemporaryFile(
            mode="w", dir=settings.RESULTS_DIR, delete=False, suffix=".json"
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
        _enforce_retention(index)
        _save_index(index)

        return metadata


def _enforce_retention(index: RunsIndex) -> None:
    max_runs = settings.DEFAULT_RUN_RETENTION
    while len(index.runs) > max_runs:
        oldest = index.runs.pop(0)
        old_path = Path(oldest.file_path)
        if old_path.exists():
            old_path.unlink()


def rename_run(run_id: str, new_report_name: str) -> RunMetadata:
    with _runs_lock:
        index = _load_index()
        for i, meta in enumerate(index.runs):
            if meta.run_id == run_id:
                safe_name = _sanitize_report_name(new_report_name)
                old_path = Path(meta.file_path)
                new_file_name = f"{run_id}_{safe_name}.json"
                new_path = settings.RESULTS_DIR / new_file_name

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
                    return data
            return None
    return None


def list_runs() -> list[RunMetadata]:
    index = _load_index()
    return list(reversed(index.runs))
