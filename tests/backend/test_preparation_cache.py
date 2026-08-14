import hashlib
import json
from dataclasses import asdict
from pathlib import Path

from apps.files.filter_services import ColumnValueInfo, FilterPreparationResult
from apps.files.preparation_cache import (
    _file_identity,
    _legacy_cache_path,
    load_preparation,
    save_preparation,
)
from apps.files.services import delete_upload
from django.test.utils import override_settings


def _result() -> FilterPreparationResult:
    return FilterPreparationResult(
        columns=["id"],
        column_values={
            "id": [
                ColumnValueInfo(
                    value="1",
                    in_file_a=True,
                    in_file_b=True,
                    display="1",
                )
            ]
        },
        total_rows_a=1,
        total_rows_b=1,
        requires_confirmation=False,
    )


def test_preparation_cache_persists_by_upload_pair_and_columns(tmp_path: Path) -> None:
    uploads = tmp_path / "uploads"
    cache = tmp_path / "prepare_cache"
    uploads.mkdir()
    path_a = uploads / "aaa.csv"
    path_b = uploads / "bbb.csv"
    path_a.write_text("id\n1\n")
    path_b.write_text("id\n1\n")

    with override_settings(UPLOADS_DIR=uploads, PREPARE_CACHE_DIR=cache):
        save_preparation(path_a, path_b, ["id"], _result())

        loaded = load_preparation(path_a, path_b, ["id"])
        assert loaded == _result()
        assert load_preparation(path_a, path_b, ["other"]) is None


def test_preparation_cache_is_reused_when_files_are_reversed(tmp_path: Path) -> None:
    uploads = tmp_path / "uploads"
    cache = tmp_path / "prepare_cache"
    uploads.mkdir()
    path_a = uploads / "first-name.csv"
    path_b = uploads / "second-name.csv"
    path_a.write_text("id\n1\n2\n")
    path_b.write_text("id\n2\n")
    result = FilterPreparationResult(
        columns=["id"],
        column_values={
            "id": [
                ColumnValueInfo(
                    value="1", in_file_a=True, in_file_b=False, display="1"
                )
            ]
        },
        total_rows_a=2,
        total_rows_b=1,
        requires_confirmation=False,
    )

    with override_settings(UPLOADS_DIR=uploads, PREPARE_CACHE_DIR=cache):
        save_preparation(path_a, path_b, ["id"], result)

        loaded = load_preparation(path_b, path_a, ["id"])

    assert loaded is not None
    assert loaded.total_rows_a == 1
    assert loaded.total_rows_b == 2
    assert loaded.column_values["id"][0].in_file_a is False
    assert loaded.column_values["id"][0].in_file_b is True


def test_legacy_preparation_cache_remains_reusable(tmp_path: Path) -> None:
    uploads = tmp_path / "uploads"
    cache = tmp_path / "prepare_cache"
    uploads.mkdir()
    path_a = uploads / "aaa.csv"
    path_b = uploads / "bbb.csv"
    path_a.write_text("id\n1\n")
    path_b.write_text("id\n1\n")

    with override_settings(UPLOADS_DIR=uploads, PREPARE_CACHE_DIR=cache):
        cache.mkdir()
        legacy_path = _legacy_cache_path(path_a, path_b, ["id"])
        legacy_path.write_text(json.dumps({
            "upload_refs": [path_a.name, path_b.name],
            **asdict(_result()),
        }))

        assert load_preparation(path_a, path_b, ["id"]) == _result()
        assert len(list(cache.glob("*.json"))) == 1


def test_upload_housekeeping_preserves_preparation_cache(tmp_path: Path) -> None:
    uploads = tmp_path / "uploads"
    cache = tmp_path / "prepare_cache"
    uploads.mkdir()
    path_a = uploads / "aaa.csv"
    path_b = uploads / "bbb.csv"
    path_c = uploads / "ccc.csv"
    path_a.write_text("id\n1\n")
    path_b.write_text("id\n1\n")
    path_c.write_text("id\n2\n")

    with override_settings(UPLOADS_DIR=uploads, PREPARE_CACHE_DIR=cache):
        save_preparation(path_a, path_b, ["id"], _result())
        save_preparation(path_b, path_c, ["id"], _result())
        assert len(list(cache.glob("*.json"))) == 2

        delete_upload(path_a)
        assert not path_a.exists()
        assert len(list(cache.glob("*.json"))) == 2
        assert load_preparation(path_b, path_c, ["id"]) == _result()

        delete_upload(path_b)
        assert len(list(cache.glob("*.json"))) == 2
        path_b.write_text("id\n1\n")
        assert load_preparation(path_b, path_c, ["id"]) == _result()


def test_content_addressed_file_identity_is_derived_from_filename(tmp_path: Path) -> None:
    uploads = tmp_path / "uploads"
    uploads.mkdir()
    path = uploads / f"{'0' * 64}.csv"
    path.write_text("id\n1\n")

    with override_settings(UPLOADS_DIR=uploads):
        assert _file_identity(path) == "0" * 64


def test_non_content_addressed_file_identity_hashes_content(tmp_path: Path) -> None:
    uploads = tmp_path / "uploads"
    uploads.mkdir()
    path = uploads / "books.csv"
    path.write_bytes(b"id\n1\n")

    with override_settings(UPLOADS_DIR=uploads):
        assert _file_identity(path) == hashlib.sha256(b"id\n1\n").hexdigest()


def test_preparation_cache_round_trip_with_content_addressed_uploads(tmp_path: Path) -> None:
    uploads = tmp_path / "uploads"
    cache = tmp_path / "prepare_cache"
    uploads.mkdir()
    path_a = uploads / f"{'a' * 64}.csv"
    path_b = uploads / f"{'b' * 64}.csv"
    path_a.write_text("id\n1\n")
    path_b.write_text("id\n1\n")

    with override_settings(UPLOADS_DIR=uploads, PREPARE_CACHE_DIR=cache):
        save_preparation(path_a, path_b, ["id"], _result())
        assert len(list(cache.glob("*.json"))) == 1
        loaded = load_preparation(path_a, path_b, ["id"])

    assert loaded == _result()


def test_content_addressed_cache_is_reused_when_files_are_reversed(tmp_path: Path) -> None:
    uploads = tmp_path / "uploads"
    cache = tmp_path / "prepare_cache"
    uploads.mkdir()
    path_a = uploads / f"{'a' * 64}.csv"
    path_b = uploads / f"{'b' * 64}.csv"
    path_a.write_text("id\n1\n2\n")
    path_b.write_text("id\n2\n")
    result = FilterPreparationResult(
        columns=["id"],
        column_values={
            "id": [
                ColumnValueInfo(
                    value="1", in_file_a=True, in_file_b=False, display="1"
                )
            ]
        },
        total_rows_a=2,
        total_rows_b=1,
        requires_confirmation=False,
    )

    with override_settings(UPLOADS_DIR=uploads, PREPARE_CACHE_DIR=cache):
        save_preparation(path_a, path_b, ["id"], result)
        loaded = load_preparation(path_b, path_a, ["id"])

    assert loaded is not None
    assert loaded.total_rows_a == 1
    assert loaded.total_rows_b == 2
    assert loaded.column_values["id"][0].in_file_a is False
    assert loaded.column_values["id"][0].in_file_b is True
