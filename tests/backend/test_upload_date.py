from datetime import date
from pathlib import Path

import pytest
from apps.files.sessions import get_session
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test.utils import override_settings
from rest_framework.test import APIClient  # type: ignore[import-untyped]

pytestmark = pytest.mark.django_db


def _upload_payload() -> dict[str, object]:
    return {
        "file_a": SimpleUploadedFile("a.csv", b"id,status\n1,active\n", content_type="text/csv"),
        "file_b": SimpleUploadedFile("b.csv", b"id,status\n1,active\n", content_type="text/csv"),
    }


def test_upload_retains_valid_as_of_date(tmp_path: Path) -> None:
    with override_settings(UPLOADS_DIR=tmp_path):
        response = APIClient().post(
            "/api/files/upload/",
            {**_upload_payload(), "as_of_date": "2026-10-30"},
            format="multipart",
        )

    assert response.status_code == 200
    body = response.json()
    assert body["as_of_date"] == "2026-10-30"
    session = get_session(body["session_id"])
    assert session is not None
    assert session.as_of_date == "2026-10-30"


def test_upload_uses_backend_default_when_date_is_omitted(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "apps.runs.as_of_date.default_as_of_date",
        lambda _today=None: date(2026, 10, 30),
    )
    with override_settings(UPLOADS_DIR=tmp_path):
        response = APIClient().post(
            "/api/files/upload/",
            _upload_payload(),
            format="multipart",
        )

    assert response.status_code == 200
    assert response.json()["as_of_date"] == "2026-10-30"


def test_upload_rejects_invalid_as_of_date_before_storing_files(tmp_path: Path) -> None:
    with override_settings(UPLOADS_DIR=tmp_path):
        response = APIClient().post(
            "/api/files/upload/",
            {**_upload_payload(), "as_of_date": "10/30/2026"},
            format="multipart",
        )

    assert response.status_code == 400
    assert "YYYY-MM-DD" in response.json()["error"]
    assert list(tmp_path.iterdir()) == []


def test_header_reinspection_returns_session_as_of_date(tmp_path: Path) -> None:
    with override_settings(UPLOADS_DIR=tmp_path):
        upload = APIClient().post(
            "/api/files/upload/",
            {**_upload_payload(), "as_of_date": "2026-09-30"},
            format="multipart",
        )
        session_id = upload.json()["session_id"]
        response = APIClient().post(
            "/api/files/inspect/",
            {"session_id": session_id},
            format="json",
        )

    assert response.status_code == 200
    assert response.json()["as_of_date"] == "2026-09-30"
