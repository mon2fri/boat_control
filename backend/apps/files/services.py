from __future__ import annotations

import hashlib
import shutil
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

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


def store_uploaded_file(uploaded_file: Any) -> tuple[Path, bool]:
    """Store an upload once, keyed by its content hash.

    Returns ``(path, deduplicated)`` where ``deduplicated`` is True when the
    digest matched an existing file already on disk and no new bytes were
    kept.
    """
    uploads_dir = Path(settings.UPLOADS_DIR)
    uploads_dir.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    with tempfile.NamedTemporaryFile(dir=uploads_dir, delete=False, suffix=".upload") as tmp:
        temporary_path = Path(tmp.name)
        for chunk in uploaded_file.chunks():
            digest.update(chunk)
            tmp.write(chunk)
    return _finish_content_addressed_store(temporary_path, digest.hexdigest())


def store_file(source: Path) -> tuple[Path, bool]:
    """Copy a configured remote file into the same deduplicated upload store.

    Returns ``(path, deduplicated)``; see :func:`store_uploaded_file`.
    """
    uploads_dir = Path(settings.UPLOADS_DIR)
    uploads_dir.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    with open(source, "rb") as input_file, tempfile.NamedTemporaryFile(
        dir=uploads_dir, delete=False, suffix=".upload"
    ) as tmp:
        temporary_path = Path(tmp.name)
        while chunk := input_file.read(1024 * 1024):
            digest.update(chunk)
            tmp.write(chunk)
    return _finish_content_addressed_store(temporary_path, digest.hexdigest())


def _finish_content_addressed_store(
    temporary_path: Path, digest: str
) -> tuple[Path, bool]:
    target = Path(settings.UPLOADS_DIR) / f"{digest}.csv"
    if target.exists():
        temporary_path.unlink(missing_ok=True)
        return target, True
    shutil.move(str(temporary_path), str(target))
    return target, False


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
    if path.exists() and path.resolve().parent == Path(settings.UPLOADS_DIR).resolve():
        path.unlink()


def reconcile_uploads() -> int:
    """Sweep data/uploads/ and remove any file not referenced by an active
    session or saved run. Returns the count of files removed.

    Designed to be called at application startup; idempotent so it's safe to
    invoke on every worker boot.
    """
    # Imported lazily to avoid a circular import at module-load time: the
    # sessions module pulls from apps.files.services at the top.
    from apps.files.sessions import remove_upload_if_unreferenced

    uploads_dir = Path(settings.UPLOADS_DIR)
    if not uploads_dir.exists():
        return 0
    removed = 0
    for candidate in uploads_dir.glob("*.csv"):
        if remove_upload_if_unreferenced(candidate):
            removed += 1
    return removed
