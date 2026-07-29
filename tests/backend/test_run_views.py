from pathlib import Path
from types import SimpleNamespace

import pytest
from rest_framework.test import APIClient


@pytest.fixture
def run_session(tmp_path: Path) -> SimpleNamespace:
    csv_a = tmp_path / "a.csv"
    csv_b = tmp_path / "b.csv"
    csv_a.write_text("id,name,status,score\n1,alice,active,10\n")
    csv_b.write_text("id,name,status,score\n1,alice,active,10\n")
    return SimpleNamespace(
        file_a_path=str(csv_a),
        file_b_path=str(csv_b),
        common_columns=["id", "name", "status", "score"],
    )


def _payload(exception_columns: list[str]) -> dict[str, object]:
    return {
        "session_id": "session-1",
        "comparison_columns": ["id", "name", "status", "score"],
        "target_columns": ["status"],
        "key_columns": ["id"],
        "exception_columns": exception_columns,
    }


def test_execute_rejects_unknown_exception_column(
    monkeypatch: pytest.MonkeyPatch, run_session: SimpleNamespace
) -> None:
    monkeypatch.setattr("apps.runs.views.get_session", lambda _: run_session)

    response = APIClient().post(
        "/api/runs/execute/", _payload(["unknown"]), format="json"
    )

    assert response.status_code == 400
    assert response.json()["error"] == "Invalid exception columns: unknown"


def test_execute_rejects_duplicate_exception_columns(
    monkeypatch: pytest.MonkeyPatch, run_session: SimpleNamespace
) -> None:
    monkeypatch.setattr("apps.runs.views.get_session", lambda _: run_session)

    response = APIClient().post(
        "/api/runs/execute/", _payload(["name", "name"]), format="json"
    )

    assert response.status_code == 400
    assert response.json()["error"] == "Duplicate exception columns: name"
