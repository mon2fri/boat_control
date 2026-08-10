from __future__ import annotations

import hashlib
import json
import tempfile
from dataclasses import asdict
from pathlib import Path
from typing import Any

from django.conf import settings

from apps.files.filter_services import (
    ColumnValueInfo,
    FilterPreparationResult,
)


def _file_identity(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        while chunk := file.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _ordered_file_identities(path_a: Path, path_b: Path) -> tuple[list[str], bool]:
    identities = [_file_identity(path_a), _file_identity(path_b)]
    ordered = sorted(identities)
    return ordered, identities == ordered


def _cache_key(path_a: Path, path_b: Path, columns: list[str]) -> str:
    file_identities, _ = _ordered_file_identities(path_a, path_b)
    identity = {
        "files": file_identities,
        "columns": columns,
    }
    encoded = json.dumps(identity, ensure_ascii=False, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def _cache_path(path_a: Path, path_b: Path, columns: list[str]) -> Path:
    return Path(settings.PREPARE_CACHE_DIR) / f"{_cache_key(path_a, path_b, columns)}.json"


def load_preparation(
    path_a: Path,
    path_b: Path,
    columns: list[str],
) -> FilterPreparationResult | None:
    if not path_a.exists() or not path_b.exists():
        return None
    cache_path = _cache_path(path_a, path_b, columns)
    try:
        raw: dict[str, Any] = json.loads(cache_path.read_text())
        result = FilterPreparationResult(
            columns=list(raw["columns"]),
            column_values={
                column: [ColumnValueInfo(**value) for value in values]
                for column, values in raw["column_values"].items()
            },
            total_rows_a=int(raw["total_rows_a"]),
            total_rows_b=int(raw["total_rows_b"]),
            requires_confirmation=bool(raw["requires_confirmation"]),
        )
        _, is_canonical = _ordered_file_identities(path_a, path_b)
        if is_canonical:
            return result
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
    except (FileNotFoundError, KeyError, TypeError, ValueError, json.JSONDecodeError):
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
    file_identities, is_canonical = _ordered_file_identities(path_a, path_b)
    if not is_canonical:
        result = FilterPreparationResult(
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
    payload = {
        "upload_refs": [path_a.resolve().name, path_b.resolve().name],
        "file_hashes": file_identities,
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
    temporary_path.replace(_cache_path(path_a, path_b, columns))


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
