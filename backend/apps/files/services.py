from __future__ import annotations

import uuid
from dataclasses import dataclass
from pathlib import Path

import polars as pl
from django.conf import settings


@dataclass(frozen=True)
class HeaderInspectionResult:
    file_a_name: str
    file_b_name: str
    columns_a: list[str]
    columns_b: list[str]
    common_columns: list[str]
    only_in_a: list[str]
    only_in_b: list[str]


def safe_upload_path(filename: str) -> Path:
    safe_name = f"{uuid.uuid4().hex}_{_sanitize_filename(filename)}"
    return settings.UPLOADS_DIR / safe_name


def _sanitize_filename(name: str) -> str:
    parts = name.rsplit(".", 1)
    stem = parts[0] if len(parts) > 1 else name
    ext = parts[1] if len(parts) > 1 else ""
    cleaned_stem = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in stem)
    cleaned_ext = "".join(c if c.isalnum() else "" for c in ext)
    if not cleaned_stem or cleaned_stem.startswith("."):
        cleaned_stem = f"file_{cleaned_stem}"
    cleaned_stem = cleaned_stem[:200]
    return f"{cleaned_stem}.{cleaned_ext}" if cleaned_ext else cleaned_stem


def read_csv_headers(path: Path) -> list[str]:
    try:
        df = pl.scan_csv(path, n_rows=0)
        return df.collect().columns
    except Exception as exc:
        raise ValueError(f"Cannot read CSV headers: {exc}") from exc


def inspect_headers(path_a: Path, name_a: str, path_b: Path, name_b: str) -> HeaderInspectionResult:
    cols_a = read_csv_headers(path_a)
    cols_b = read_csv_headers(path_b)

    set_a = set(cols_a)
    set_b = set(cols_b)

    common = [c for c in cols_a if c in set_b]
    only_a = [c for c in cols_a if c not in set_b]
    only_b = [c for c in cols_b if c not in set_a]

    return HeaderInspectionResult(
        file_a_name=name_a,
        file_b_name=name_b,
        columns_a=cols_a,
        columns_b=cols_b,
        common_columns=common,
        only_in_a=only_a,
        only_in_b=only_b,
    )


def delete_upload(path: Path) -> None:
    if path.exists() and path.parent == settings.UPLOADS_DIR:
        path.unlink()
