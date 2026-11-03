import json
from dataclasses import asdict
from pathlib import Path

import pytest
from apps.files.filter_services import ColumnValueInfo, FilterPreparationResult
from apps.files.preparation_cache import (
    _legacy_cache_path,
    delete_for_upload,
    load_preparation,
    save_preparation,
    upload_is_referenced,
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


def test_cache_reads_use_utf8_on_gbk_hosts(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path_a = tmp_path / "a.csv"
    path_b = tmp_path / "b.csv"
    path_a.write_bytes(b"id\n1\n")
    path_b.write_bytes(b"id\n2\n")
    result = _result()
    result.column_values["id"][:] = [
        ColumnValueInfo(value="“reviewed”", display="“reviewed”", in_file_a=True, in_file_b=True)
    ]
    original_read_text = Path.read_text

    def gbk_read_text(self: Path, encoding: str | None = None, **kwargs: object) -> str:
        return original_read_text(self, encoding=encoding or "gbk")

    with override_settings(PREPARE_CACHE_DIR=tmp_path / "cache"):
        save_preparation(path_a, path_b, ["id"], result)
        monkeypatch.setattr(Path, "read_text", gbk_read_text)
        assert upload_is_referenced(path_a)
        assert load_preparation(path_a, path_b, ["id"]) == result
        assert delete_for_upload(path_a) == 1
        assert not upload_is_referenced(path_a)


def test_malformed_utf8_cache_does_not_break_reference_checks(tmp_path: Path) -> None:
    cache = tmp_path / "cache"
    cache.mkdir()
    (cache / "broken.json").write_bytes(b"\xff")
    with override_settings(PREPARE_CACHE_DIR=cache):
        assert not upload_is_referenced(tmp_path / "a.csv")
        assert delete_for_upload(tmp_path / "a.csv") == 0
