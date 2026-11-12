from __future__ import annotations

import json
import tempfile
import threading
import uuid
from collections.abc import Mapping
from dataclasses import asdict, dataclass
from datetime import UTC, date, datetime
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
    as_of_date: str | None = None
    new_exceptions_only: bool = True


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
            as_of_date=r.get("as_of_date"),
            new_exceptions_only=bool(r.get("new_exceptions_only", True)),
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
                "as_of_date": r.as_of_date,
                "new_exceptions_only": r.new_exceptions_only,
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
    as_of_date: date | None = None,
    created_at: datetime | None = None,
    lineage_context: Mapping[str, Any] | None = None,
) -> RunMetadata:
    expired_upload_paths: list[Path] = []
    with _runs_lock:
        run_id = _generate_run_id()
        effective_name = report_name or _default_report_name(file_a_name, file_b_name)
        safe_name = _sanitize_report_name(effective_name)
        comparison = asdict(result.comparison)
        new_book_details = comparison.pop("new_book_rows")
        effective_as_of_date = as_of_date or result.as_of_date
        created_at_value = created_at or datetime.now(UTC)
        if created_at_value.tzinfo is None or created_at_value.utcoffset() is None:
            created_at_value = created_at_value.replace(tzinfo=UTC)
        created_at_text = created_at_value.astimezone(UTC).isoformat()

        run_data: dict[str, Any] = {
            "run_id": run_id,
            "report_name": effective_name,
            "file_a_name": file_a_name,
            "file_b_name": file_b_name,
            "created_at": created_at_text,
            "as_of_date": (
                effective_as_of_date.isoformat()
                if effective_as_of_date is not None
                else None
            ),
            "upload_refs": list(
                dict.fromkeys(
                    path.name
                    for path in (file_a_path, file_b_path)
                    if path is not None
                )
            ),
            "result": {
                # The public wire contract calls these ``new_book_details``.
                # Keep the internal dataclass name separate so persistence and
                # every report reader agree on the same field.
                "comparison": {
                    **comparison,
                    "new_book_details": new_book_details,
                },
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
                "rule_bindings": result.rule_bindings,
                "common_columns": result.common_columns,
                "target_columns": result.target_columns,
                "key_columns": result.key_columns,
                "filters_applied": result.filters_applied,
                "filter_relation": result.filter_relation,
                "filter_grouping_tree": result.filter_grouping_tree,
                "aggregation_columns": result.aggregation_columns,
                "aggregation_column_labels": result.aggregation_column_labels,
                "nested_aggregation_enabled": result.nested_aggregation_enabled,
                "comparison_sections": result.comparison_sections,
                "exception_columns": result.exception_columns,
                "extra_column_display": result.extra_column_display,
                "group_statistics": result.group_statistics,
                "commentary_template_columns": result.commentary_template_columns,
                "new_exceptions_only": result.new_exceptions_only,
                # Target lineage/revision context for cross-revision commentary
                # carry. Additive: older snapshots load without this key.
                "lineage_context": dict(lineage_context or {}),
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
            created_at=created_at_text,
            file_path=str(file_path),
            as_of_date=run_data["as_of_date"],
            new_exceptions_only=result.new_exceptions_only,
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
                    as_of_date=meta.as_of_date,
                    new_exceptions_only=meta.new_exceptions_only,
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
                    # Historical runs may predate exception tracking. Expose an
                    # explicit null rather than inventing a date (and never touch
                    # tracking rows on read).
                    if "as_of_date" not in data:
                        data["as_of_date"] = meta.as_of_date
                    # Backward compatibility: accept legacy grouping_columns
                    result = data.get("result", {})
                    if "aggregation_columns" not in result:
                        result["aggregation_columns"] = result.get("grouping_columns", [])
                    if "aggregation_column_labels" not in result:
                        result["aggregation_column_labels"] = {}
                    if "group_statistics" not in result:
                        result["group_statistics"] = None
                    if "filters_applied" not in result:
                        result["filters_applied"] = []
                    if "filter_relation" not in result:
                        result["filter_relation"] = None
                    if "filter_grouping_tree" not in result:
                        result["filter_grouping_tree"] = None
                    if "nested_aggregation_enabled" not in result:
                        result["nested_aggregation_enabled"] = False
                    if "comparison_sections" not in result:
                        result["comparison_sections"] = []
                    if "exception_columns" not in result:
                        result["exception_columns"] = []
                    if "rule_bindings" not in result:
                        # Legacy runs cannot be linked safely from their local Rxxx IDs.
                        result["rule_bindings"] = {}
                    if "commentary_template_columns" not in result:
                        result["commentary_template_columns"] = []
                    if "new_exceptions_only" not in result:
                        result["new_exceptions_only"] = True
                    if "lineage_context" not in result:
                        result["lineage_context"] = {}
                    validation = result.get("validation") or {}
                    if isinstance(validation, dict):
                        for violations in (validation.get("violations_by_rule") or {}).values():
                            if not isinstance(violations, list):
                                continue
                            for violation in violations:
                                if not isinstance(violation, dict):
                                    continue
                                violation.setdefault("detail_values", {})
                                violation.setdefault("exception_id", None)
                                violation.setdefault("exception_status", None)
                                violation.setdefault("outcome_columns", [])
                                violation.setdefault("outcome_values", {})
                                violation.setdefault("outcome_results", {})
                    comparison = result.get("comparison", {})
                    if "new_book_count" not in comparison:
                        comparison["new_book_count"] = 0
                    if "new_book_details" not in comparison:
                        # Migrate the brief internal field name used by the
                        # initial implementation, rather than dropping real
                        # new-book rows on load.
                        comparison["new_book_details"] = comparison.pop("new_book_rows", [])
                    gs = result.get("group_statistics")
                    if gs and "new_books" not in gs:
                        gs["new_books"] = []
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
