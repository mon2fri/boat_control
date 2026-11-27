import threading
import time
from pathlib import Path

from apps.files.filter_services import ColumnValueInfo, FilterPreparationResult
from apps.files.preparation_cache import save_preparation
from apps.files.preparation_store import (
    drop_by_key,
    get_prepared,
    pair_key,
    prewarm_preparation,
    put_prepared,
    restrict_columns,
)
from apps.files.sessions import create_session, delete_session
from django.test.utils import override_settings

UPLOADS_HEX = "0123456789abcdef" * 4  # 64-char hex, matches upload store names


def _uploads(tmp_path: Path) -> Path:
    uploads = tmp_path / "uploads"
    uploads.mkdir(exist_ok=True)
    return uploads


def _write_upload(uploads: Path, hex_digest: str, content: str) -> Path:
    path = uploads / f"{hex_digest}.csv"
    path.write_text(content)
    return path


def _result() -> FilterPreparationResult:
    return FilterPreparationResult(
        columns=["id", "name"],
        column_values={
            "id": [
                ColumnValueInfo(value="1", in_file_a=True, in_file_b=True, display="1")
            ],
            "name": [
                ColumnValueInfo(
                    value="alpha", in_file_a=True, in_file_b=False, display="alpha"
                )
            ],
        },
        total_rows_a=2,
        total_rows_b=3,
        requires_confirmation=False,
    )


def test_restrict_columns_keeps_requested_subset() -> None:
    result = _result()
    sliced = restrict_columns(result, ["name"])
    assert sliced.columns == ["name"]
    assert set(sliced.column_values) == {"name"}
    assert sliced.total_rows_a == 2
    assert sliced.total_rows_b == 3
    assert sliced.requires_confirmation is False


def test_restrict_columns_keeps_requested_order() -> None:
    result = _result()
    sliced = restrict_columns(result, ["name", "id"])
    assert sliced.columns == ["name", "id"]
    assert list(sliced.column_values) == ["name", "id"]


def test_restrict_columns_returns_same_object_when_all_requested() -> None:
    result = _result()
    assert restrict_columns(result, ["id", "name"]) is result


def test_restrict_columns_falls_back_to_all_when_none_match() -> None:
    result = _result()
    assert restrict_columns(result, ["missing"]) is result


def test_put_get_round_trip_is_orientation_aware(tmp_path: Path) -> None:
    uploads = _uploads(tmp_path)
    path_a = _write_upload(uploads, UPLOADS_HEX, "id,name\n1,alpha\n")
    path_b = _write_upload(uploads, "fedcba9876543210" * 4, "id,name\n1,beta\n")
    with override_settings(UPLOADS_DIR=uploads):
        put_prepared(path_a, path_b, _result())
        try:
            forward = get_prepared(path_a, path_b)
            reversed_result = get_prepared(path_b, path_a)
        finally:
            drop_by_key(pair_key(path_a, path_b))

    assert forward is not None
    assert forward.total_rows_a == 2
    assert forward.total_rows_b == 3
    assert reversed_result is not None
    assert reversed_result.total_rows_a == 3
    assert reversed_result.total_rows_b == 2


def test_drop_by_key_removes_entry(tmp_path: Path) -> None:
    uploads = _uploads(tmp_path)
    path_a = _write_upload(uploads, UPLOADS_HEX, "id\n1\n")
    path_b = _write_upload(uploads, "fedcba9876543210" * 4, "id\n2\n")
    with override_settings(UPLOADS_DIR=uploads):
        put_prepared(path_a, path_b, _result())
        assert get_prepared(path_a, path_b) is not None
        drop_by_key(pair_key(path_a, path_b))
        assert get_prepared(path_a, path_b) is None


def _wait_for_prepared(
    path_a: Path, path_b: Path, timeout_s: float = 10
) -> FilterPreparationResult | None:
    deadline = time.monotonic() + timeout_s
    prepared = None
    while time.monotonic() < deadline:
        prepared = get_prepared(path_a, path_b)
        if prepared is not None:
            break
        time.sleep(0.05)
    return prepared


def test_prewarm_populates_ram_store(tmp_path: Path) -> None:
    uploads = _uploads(tmp_path)
    cache = tmp_path / "prepare_cache"
    path_a = _write_upload(uploads, UPLOADS_HEX, "id,name\n1,alpha\n2,beta\n")
    path_b = _write_upload(uploads, "fedcba9876543210" * 4, "id,name\n1,alpha\n")
    with override_settings(UPLOADS_DIR=uploads, PREPARE_CACHE_DIR=cache):
        session = create_session(
            file_a_path=path_a,
            file_b_path=path_b,
            file_a_name="a.csv",
            file_b_name="b.csv",
            common_columns=["id", "name"],
            columns_a=["id", "name"],
            columns_b=["id", "name"],
            only_in_a=[],
            only_in_b=[],
        )
        try:
            ready = threading.Event()
            prewarm_preparation(path_a, path_b, session.session_id, ready)
            ready.set()

            prepared = _wait_for_prepared(path_a, path_b)

            assert prepared is not None
            assert prepared.columns == ["id", "name"]
            assert prepared.total_rows_a == 2
            assert prepared.total_rows_b == 1
            # Prewarm fills RAM only; disk persistence happens lazily on the
            # first preparation request so test runs stay hermetic.
            assert len(list(cache.glob("*.json"))) == 0
        finally:
            delete_session(session.session_id)


def test_prewarm_reuses_existing_disk_cache(tmp_path: Path) -> None:
    uploads = _uploads(tmp_path)
    cache = tmp_path / "prepare_cache"
    path_a = _write_upload(uploads, UPLOADS_HEX, "id,name\n1,alpha\n2,beta\n")
    path_b = _write_upload(uploads, "fedcba9876543210" * 4, "id,name\n1,alpha\n")
    with override_settings(UPLOADS_DIR=uploads, PREPARE_CACHE_DIR=cache):
        session = create_session(
            file_a_path=path_a,
            file_b_path=path_b,
            file_a_name="a.csv",
            file_b_name="b.csv",
            common_columns=["id", "name"],
            columns_a=["id", "name"],
            columns_b=["id", "name"],
            only_in_a=[],
            only_in_b=[],
        )
        try:
            save_preparation(path_a, path_b, ["id", "name"], _result())
            ready = threading.Event()
            prewarm_preparation(path_a, path_b, session.session_id, ready)
            ready.set()

            prepared = _wait_for_prepared(path_a, path_b)

            assert prepared is not None
            assert prepared == _result()
            # Reused, not recomputed or rewritten.
            assert len(list(cache.glob("*.json"))) == 1
        finally:
            delete_session(session.session_id)
