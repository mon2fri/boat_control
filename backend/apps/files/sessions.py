from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

from django.conf import settings


@dataclass(frozen=True)
class UploadSession:
    session_id: str
    file_a_path: str
    file_b_path: str
    file_a_name: str
    file_b_name: str
    common_columns: list[str]
    columns_a: list[str]
    columns_b: list[str]
    only_in_a: list[str]
    only_in_b: list[str]
    created_at: str


_SESSION_TTL = timedelta(hours=24)
_lock = threading.Lock()
_sessions: dict[str, UploadSession] = {}


def create_session(
    file_a_path: Path,
    file_b_path: Path,
    file_a_name: str,
    file_b_name: str,
    common_columns: list[str],
    columns_a: list[str],
    columns_b: list[str],
    only_in_a: list[str],
    only_in_b: list[str],
) -> UploadSession:
    session_id = uuid.uuid4().hex[:12]
    session = UploadSession(
        session_id=session_id,
        file_a_path=str(file_a_path),
        file_b_path=str(file_b_path),
        file_a_name=file_a_name,
        file_b_name=file_b_name,
        common_columns=common_columns,
        columns_a=columns_a,
        columns_b=columns_b,
        only_in_a=only_in_a,
        only_in_b=only_in_b,
        created_at=datetime.now(UTC).isoformat(),
    )
    with _lock:
        _sessions[session_id] = session
    return session


def get_session(session_id: str) -> UploadSession | None:
    with _lock:
        session = _sessions.get(session_id)
    if session and _is_expired(session):
        delete_session(session_id)
        return None
    return session


def delete_session(session_id: str) -> None:
    with _lock:
        session = _sessions.pop(session_id, None)
    if session:
        _cleanup_files(session)


def _is_expired(session: UploadSession) -> bool:
    created = datetime.fromisoformat(session.created_at)
    return datetime.now(UTC) - created > _SESSION_TTL


def _cleanup_files(session: UploadSession) -> None:
    for path_str in (session.file_a_path, session.file_b_path):
        p = Path(path_str)
        if p.exists() and p.parent == settings.UPLOADS_DIR:
            p.unlink(missing_ok=True)
