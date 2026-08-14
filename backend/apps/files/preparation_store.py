from __future__ import annotations

import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from apps.files.filter_services import FilterPreparationResult, prepare_filters
from apps.files.preparation_cache import (
    _ordered_file_identities,
    _swap_result,
    load_preparation,
)

logger = logging.getLogger(__name__)

# The prewarm job waits for the session to exist (signalled by the upload view
# after header inspection + session creation) before doing any heavy I/O, so
# header inspection always gets priority. The timeout only guards against a
# failed inspection that never sets the event.
_PREWARM_EVENT_TIMEOUT_S = 60

_lock = threading.Lock()
_store: dict[str, FilterPreparationResult] = {}
_PREWARM_EXECUTOR = ThreadPoolExecutor(max_workers=1, thread_name_prefix="prepare-prewarm")


def pair_key(path_a: Path, path_b: Path) -> str:
    identities, _ = _ordered_file_identities(path_a, path_b)
    return "|".join(identities)


def get_prepared(path_a: Path, path_b: Path) -> FilterPreparationResult | None:
    """Return the in-memory preparation, oriented for (path_a, path_b)."""
    identities, is_canonical = _ordered_file_identities(path_a, path_b)
    with _lock:
        result = _store.get("|".join(identities))
    if result is None:
        return None
    return result if is_canonical else _swap_result(result)


def put_prepared(path_a: Path, path_b: Path, result: FilterPreparationResult) -> None:
    """Store a preparation keyed by the file pair, in canonical orientation."""
    _, is_canonical = _ordered_file_identities(path_a, path_b)
    stored = result if is_canonical else _swap_result(result)
    with _lock:
        _store[pair_key(path_a, path_b)] = stored


def drop_by_key(key: str) -> None:
    with _lock:
        _store.pop(key, None)


def restrict_columns(
    result: FilterPreparationResult, columns: list[str]
) -> FilterPreparationResult:
    """Drop every column not requested, preserving the requested order."""
    available = [column for column in columns if column in result.column_values]
    if not available:
        available = result.columns
    if available == result.columns:
        return result
    return FilterPreparationResult(
        columns=available,
        column_values={column: result.column_values[column] for column in available},
        total_rows_a=result.total_rows_a,
        total_rows_b=result.total_rows_b,
        requires_confirmation=result.requires_confirmation,
    )


def prewarm_preparation(
    path_a: Path,
    path_b: Path,
    session_id: str,
    ready: threading.Event,
) -> None:
    """Kick off background preparation for a fresh upload.

    Runs concurrently with header inspection: the job waits on ``ready`` (set
    after the session is created) so it never contends with the inspection I/O.
    The full value sets are kept in RAM keyed by the file pair, so later page 2
    requests only have to drop unused columns.
    """
    _PREWARM_EXECUTOR.submit(_prewarm_job, path_a, path_b, session_id, ready)


def _prewarm_job(
    path_a: Path,
    path_b: Path,
    session_id: str,
    ready: threading.Event,
) -> None:
    from apps.files.sessions import get_session  # lazy to avoid an import cycle

    if not ready.wait(timeout=_PREWARM_EVENT_TIMEOUT_S):
        return
    session = get_session(session_id)
    if session is None:
        return
    try:
        result = load_preparation(path_a, path_b, session.common_columns)
        if result is None:
            result = prepare_filters(path_a, path_b, session.common_columns)
    except Exception:
        logger.exception("Preparation prewarm failed session=%s", session_id)
        return
    if get_session(session_id) is None:
        return
    put_prepared(path_a, path_b, result)
    logger.info(
        "Preparation prewarm ready session=%s columns=%d",
        session_id,
        len(result.columns),
    )
