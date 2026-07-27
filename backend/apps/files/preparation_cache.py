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


def _cache_key(path_a: Path, path_b: Path, columns: list[str]) -> str:
    identity = {
        "file_a": path_a.resolve().name,
        "file_b": path_b.resolve().name,
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
    payload = {
        "upload_refs": [path_a.resolve().name, path_b.resolve().name],
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
