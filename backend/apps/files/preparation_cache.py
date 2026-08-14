from __future__ import annotations

import hashlib
import json
import re
import tempfile
from dataclasses import asdict
from pathlib import Path
from typing import Any

from django.conf import settings

from apps.files.filter_services import (
    ColumnValueInfo,
    FilterPreparationResult,
)

_DIGEST_RE = re.compile(r"^[0-9a-f]{64}$")


def _file_identity(path: Path) -> str:
    resolved = path.resolve()
    uploads_dir = Path(settings.UPLOADS_DIR).resolve()
    if resolved.parent == uploads_dir and _DIGEST_RE.match(resolved.stem):
        return resolved.stem
    digest = hashlib.sha256()
    with path.open("rb") as file:
        while chunk := file.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _ordered_file_identities(path_a: Path, path_b: Path) -> tuple[list[str], bool]:
    identities = [_file_identity(path_a), _file_identity(path_b)]
    ordered = sorted(identities)
    return ordered, identities == ordered


def _cache_key(identities: list[str], columns: list[str]) -> str:
    identity = {
        "files": identities,
        # Preparation computes independent value sets per column, so column
        # order should not prevent reuse of the same prepared data.
        "columns": sorted(set(columns)),
    }
    encoded = json.dumps(identity, ensure_ascii=False, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def _cache_path(identities: list[str], columns: list[str]) -> Path:
    return Path(settings.PREPARE_CACHE_DIR) / f"{_cache_key(identities, columns)}.json"


def _previous_cache_path(identities: list[str], columns: list[str]) -> Path:
    """Return the pre-2026-08-12 key so existing caches can be migrated on read."""
    identity = {"files": identities, "columns": columns}
    encoded = json.dumps(identity, ensure_ascii=False, separators=(",", ":")).encode()
    key = hashlib.sha256(encoded).hexdigest()
    return Path(settings.PREPARE_CACHE_DIR) / f"{key}.json"


def _legacy_cache_path(path_a: Path, path_b: Path, columns: list[str]) -> Path:
    identity = {
        "file_a": path_a.resolve().name,
        "file_b": path_b.resolve().name,
        "columns": columns,
    }
    encoded = json.dumps(identity, ensure_ascii=False, separators=(",", ":")).encode()
    key = hashlib.sha256(encoded).hexdigest()
    return Path(settings.PREPARE_CACHE_DIR) / f"{key}.json"


def _swap_result(result: FilterPreparationResult) -> FilterPreparationResult:
    return FilterPreparationResult(
        columns=result.columns,
        column_values={
            column: [
                ColumnValueInfo(
                    value=value.value,
                    in_file_a=value.in_file_b,
                    in_file_b=value.in_file_a,
                    display=value.display,
                )
                for value in values
            ]
            for column, values in result.column_values.items()
        },
        total_rows_a=result.total_rows_b,
        total_rows_b=result.total_rows_a,
        requires_confirmation=result.requires_confirmation,
    )


def _read_result(raw: dict[str, Any]) -> FilterPreparationResult:
    return FilterPreparationResult(
        columns=list(raw["columns"]),
        column_values={
            column: [ColumnValueInfo(**value) for value in values]
            for column, values in raw["column_values"].items()
        },
        total_rows_a=int(raw["total_rows_a"]),
        total_rows_b=int(raw["total_rows_b"]),
        requires_confirmation=bool(raw["requires_confirmation"]),
    )


def _in_requested_order(
    result: FilterPreparationResult, columns: list[str]
) -> FilterPreparationResult:
    if result.columns == columns:
        return result
    if set(result.columns) != set(columns):
        return result
    return FilterPreparationResult(
        columns=list(columns),
        column_values={column: result.column_values[column] for column in columns},
        total_rows_a=result.total_rows_a,
        total_rows_b=result.total_rows_b,
        requires_confirmation=result.requires_confirmation,
    )


def load_preparation(
    path_a: Path,
    path_b: Path,
    columns: list[str],
) -> FilterPreparationResult | None:
    if not path_a.exists() or not path_b.exists():
        return None
    identities, is_canonical = _ordered_file_identities(path_a, path_b)
    current_path = _cache_path(identities, columns)
    cache_paths = [
        current_path,
        _previous_cache_path(identities, columns),
        _legacy_cache_path(path_a, path_b, columns),
    ]
    reverse_legacy_path = _legacy_cache_path(path_b, path_a, columns)
    if reverse_legacy_path not in cache_paths:
        cache_paths.append(reverse_legacy_path)

    for cache_path in cache_paths:
        try:
            raw: dict[str, Any] = json.loads(cache_path.read_text())
            result = _read_result(raw)
            if "file_hashes" in raw:
                oriented = result if is_canonical else _swap_result(result)
                return _in_requested_order(oriented, columns)

            references = raw.get("upload_refs", [])
            requested = [path_a.resolve().name, path_b.resolve().name]
            oriented = result if references == requested else _swap_result(result)
            return oriented
        except FileNotFoundError:
            continue
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            cache_path.unlink(missing_ok=True)
    return None


def save_preparation(
    path_a: Path,
    path_b: Path,
    columns: list[str],
    result: FilterPreparationResult,
) -> None:
    cache_dir = Path(settings.PREPARE_CACHE_DIR)
    cache_dir.mkdir(parents=True, exist_ok=True)
    identities, is_canonical = _ordered_file_identities(path_a, path_b)
    if not is_canonical:
        result = _swap_result(result)
    payload = {
        "upload_refs": [path_a.resolve().name, path_b.resolve().name],
        "file_hashes": identities,
        **asdict(result),
    }
    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=cache_dir,
        delete=False,
        suffix=".json",
    ) as temporary:
        json.dump(payload, temporary, ensure_ascii=False, separators=(",", ":"))
        temporary_path = Path(temporary.name)
    temporary_path.replace(_cache_path(identities, columns))


def delete_for_upload(path: Path) -> int:
    cache_dir = Path(settings.PREPARE_CACHE_DIR)
    if not cache_dir.exists():
        return 0
    upload_ref = path.resolve().name
    removed = 0
    for cache_path in cache_dir.glob("*.json"):
        try:
            raw = json.loads(cache_path.read_text())
            references = raw.get("upload_refs", [])
        except (OSError, TypeError, json.JSONDecodeError):
            references = []
        if upload_ref in references:
            cache_path.unlink(missing_ok=True)
            removed += 1
    return removed


def upload_is_referenced(path: Path) -> bool:
    """Return whether a persisted preparation cache still needs this upload."""
    cache_dir = Path(settings.PREPARE_CACHE_DIR)
    if not cache_dir.exists():
        return False
    upload_ref = path.resolve().name
    for cache_path in cache_dir.glob("*.json"):
        try:
            raw = json.loads(cache_path.read_text())
        except (OSError, TypeError, json.JSONDecodeError):
            continue
        if upload_ref in raw.get("upload_refs", []):
            return True
    return False
