from pathlib import Path

from apps.files.filter_services import ColumnValueInfo, FilterPreparationResult
from apps.files.preparation_cache import (
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


def test_upload_housekeeping_removes_only_related_cache_files(tmp_path: Path) -> None:
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
        assert len(list(cache.glob("*.json"))) == 1
        assert load_preparation(path_b, path_c, ["id"]) == _result()

        delete_upload(path_b)
        assert len(list(cache.glob("*.json"))) == 0
