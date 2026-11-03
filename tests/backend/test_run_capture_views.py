from datetime import UTC, date, datetime
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from apps.rules.services import LogicClause, Rule, RulesFile
from apps.runs.persistence import list_runs, load_run
from django.test.utils import override_settings
from rest_framework.test import APIClient  # type: ignore[import-untyped]

pytestmark = pytest.mark.django_db

RULE_IDENTIFIER = "CBR1_00000000000000000000"


def _write_csvs(tmp_path: Path) -> tuple[Path, Path]:
    file_a = tmp_path / "a.csv"
    file_b = tmp_path / "b.csv"
    file_a.write_text("id,status\n1,active\n2,active\n")
    file_b.write_text("id,status\n1,inactive\n2,active\n")
    return file_a, file_b


def _session(tmp_path: Path, as_of_date: str | None = None) -> SimpleNamespace:
    file_a, file_b = _write_csvs(tmp_path)
    return SimpleNamespace(
        file_a_path=str(file_a),
        file_b_path=str(file_b),
        file_a_name="a.csv",
        file_b_name="b.csv",
        common_columns=["id", "status"],
        columns_a=["id", "status"],
        columns_b=["id", "status"],
        as_of_date=as_of_date,
    )


def _rule() -> Rule:
    return Rule(
        rule_id="R001",
        name="Status must be active",
        description="",
        conditions=[],
        condition_relation=None,
        grouping=None,
        grouping_tree=None,
        logic=LogicClause("value_vs_column", "status", "eq", "active"),
        rule_identifier=RULE_IDENTIFIER,
    )


def _never_matching_rule() -> Rule:
    return Rule(
        rule_id="R001",
        name="Status must match an impossible value",
        description="",
        conditions=[],
        condition_relation=None,
        grouping=None,
        grouping_tree=None,
        logic=LogicClause("value_vs_column", "status", "eq", "missing"),
        rule_identifier=RULE_IDENTIFIER,
    )


def _payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "session_id": "session-1",
        "comparison_columns": ["id", "status"],
        "target_columns": ["status"],
        "key_columns": ["id"],
        "rule_ids": ["R001"],
    }
    payload.update(overrides)
    return payload


@pytest.fixture
def capture_calls() -> list[dict[str, Any]]:
    return []


@pytest.fixture
def patch_capture(
    monkeypatch: pytest.MonkeyPatch, capture_calls: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    def fake_capture(
        result: Any,
        as_of_date: date,
        *,
        captured_at: datetime | None = None,
        template_columns: list[str] | None = None,
    ) -> object:
        capture_calls.append(
            {
                "result": result,
                "as_of_date": as_of_date,
                "captured_at": captured_at,
                "template_columns": template_columns,
            }
        )
        return {"captured": result.validation.total_violations}

    monkeypatch.setattr("apps.runs.views.capture_run_exceptions", fake_capture)
    monkeypatch.setattr(
        "apps.runs.views.enrich_execution_result",
        lambda result, _as_of_date: result,
    )
    return capture_calls


@pytest.fixture
def isolated_rules(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "apps.runs.services.load_rules",
        lambda: RulesFile(version=1, rules=[_rule()], next_index=2),
    )


def test_execute_propagates_explicit_as_of_date_and_captures_before_save(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    patch_capture: list[dict[str, Any]],
    isolated_rules: None,
) -> None:
    monkeypatch.setattr("apps.runs.views.get_session", lambda _: _session(tmp_path))
    with override_settings(RESULTS_DIR=tmp_path / "results"):
        response = APIClient().post(
            "/api/runs/execute/",
            _payload(as_of_date="2026-10-30"),
            format="json",
        )
        runs = list_runs()
        loaded = (
            load_run(response.json().get("run_id", ""))
            if response.status_code == 200
            else None
        )

    assert response.status_code == 200
    assert response.json()["as_of_date"] == "2026-10-30"
    assert len(patch_capture) == 1
    assert patch_capture[0]["as_of_date"] == date(2026, 10, 30)
    assert patch_capture[0]["captured_at"].tzinfo is UTC
    assert patch_capture[0]["result"].validation.total_violations == 1
    assert len(runs) == 1
    assert runs[0].as_of_date == "2026-10-30"
    assert loaded is not None
    assert loaded["as_of_date"] == "2026-10-30"


def test_execute_falls_back_to_upload_session_date(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    patch_capture: list[dict[str, Any]],
    isolated_rules: None,
) -> None:
    monkeypatch.setattr(
        "apps.runs.views.get_session",
        lambda _: _session(tmp_path, as_of_date="2026-09-30"),
    )
    with override_settings(RESULTS_DIR=tmp_path / "results"):
        response = APIClient().post("/api/runs/execute/", _payload(), format="json")

    assert response.status_code == 200
    assert response.json()["as_of_date"] == "2026-09-30"
    assert patch_capture[0]["as_of_date"] == date(2026, 9, 30)


def test_execute_uses_backend_default_when_no_date_is_available(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    patch_capture: list[dict[str, Any]],
    isolated_rules: None,
) -> None:
    monkeypatch.setattr(
        "apps.runs.as_of_date.default_as_of_date",
        lambda _today=None: date(2026, 10, 30),
    )
    monkeypatch.setattr("apps.runs.views.get_session", lambda _: _session(tmp_path))
    with override_settings(RESULTS_DIR=tmp_path / "results"):
        response = APIClient().post("/api/runs/execute/", _payload(), format="json")

    assert response.status_code == 200
    assert response.json()["as_of_date"] == "2026-10-30"
    assert patch_capture[0]["as_of_date"] == date(2026, 10, 30)


def test_execute_rejects_invalid_date_before_execution_or_capture(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    patch_capture: list[dict[str, Any]],
    isolated_rules: None,
) -> None:
    monkeypatch.setattr("apps.runs.views.get_session", lambda _: _session(tmp_path))
    with override_settings(RESULTS_DIR=tmp_path / "results"):
        response = APIClient().post(
            "/api/runs/execute/",
            _payload(as_of_date="2026-02-30"),
            format="json",
        )
        runs = list_runs()

    assert response.status_code == 400
    assert "not a valid calendar date" in response.json()["error"]
    assert patch_capture == []
    assert runs == []


def test_tracking_failure_returns_actionable_error_and_saves_no_run(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    isolated_rules: None,
) -> None:
    from apps.runs.tracking_capture import ExceptionCaptureError

    def failing_capture(*_args: Any, **_kwargs: Any) -> object:
        raise ExceptionCaptureError(
            "Exception tracking capture failed: disk is read-only. "
            "The run was not saved. Retry the same As-of Date."
        )

    monkeypatch.setattr("apps.runs.views.get_session", lambda _: _session(tmp_path))
    monkeypatch.setattr("apps.runs.views.capture_run_exceptions", failing_capture)
    with override_settings(RESULTS_DIR=tmp_path / "results"):
        response = APIClient().post(
            "/api/runs/execute/",
            _payload(as_of_date="2026-10-30"),
            format="json",
        )
        runs = list_runs()

    assert response.status_code == 500
    body = response.json()
    assert body["tracking_failed"] is True
    assert body["retryable"] is True
    assert body["as_of_date"] == "2026-10-30"
    assert "run was not saved" in body["error"]
    assert runs == []


def test_empty_run_is_still_captured_for_the_selected_date(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    patch_capture: list[dict[str, Any]],
    isolated_rules: None,
) -> None:
    monkeypatch.setattr("apps.runs.views.get_session", lambda _: _session(tmp_path))
    with override_settings(RESULTS_DIR=tmp_path / "results"):
        response = APIClient().post(
            "/api/runs/execute/",
            _payload(as_of_date="2026-10-30", rule_ids=[]),
            format="json",
        )

    assert response.status_code == 200
    assert patch_capture[0]["result"].validation.violations_by_rule == {}
    assert response.json()["result"]["validation"]["total_violations"] == 0


def test_same_date_rerun_is_accepted_and_captured_again(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    patch_capture: list[dict[str, Any]],
    isolated_rules: None,
) -> None:
    monkeypatch.setattr("apps.runs.views.get_session", lambda _: _session(tmp_path))
    with override_settings(RESULTS_DIR=tmp_path / "results"):
        first = APIClient().post(
            "/api/runs/execute/",
            _payload(as_of_date="2026-10-30"),
            format="json",
        )
        second = APIClient().post(
            "/api/runs/execute/",
            _payload(as_of_date="2026-10-30"),
            format="json",
        )
        runs = list_runs()

    assert first.status_code == 200
    assert second.status_code == 200
    assert [call["as_of_date"] for call in patch_capture] == [
        date(2026, 10, 30),
        date(2026, 10, 30),
    ]
    assert len(runs) == 2


def test_execute_carries_ordered_commentary_template_selection(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    patch_capture: list[dict[str, Any]],
    isolated_rules: None,
) -> None:
    monkeypatch.setattr("apps.runs.views.get_session", lambda _: _session(tmp_path))
    with override_settings(RESULTS_DIR=tmp_path / "results"):
        response = APIClient().post(
            "/api/runs/execute/",
            _payload(
                as_of_date="2026-10-30",
                commentary_template_columns=["status"],
            ),
            format="json",
        )
        loaded = load_run(response.json()["run_id"])

    assert response.status_code == 200
    assert patch_capture[0]["template_columns"] == ["status"]
    assert response.json()["result"]["commentary_template_columns"] == ["status"]
    assert loaded is not None
    assert loaded["result"]["commentary_template_columns"] == ["status"]
    assert (
        loaded["result"]["validation"]["violations_by_rule"]["R001"][0][
            "detail_values"
        ]
        == {"status": "inactive"}
    )


@pytest.mark.parametrize(
    ("selection", "message"),
    [
        (["unknown"], "Invalid commentary template columns: unknown"),
        (["status", "status"], "duplicate column 'status'"),
        (["Rule Index"], "reserved template header 'Rule Index'"),
        ("status", "ordered list of column names"),
    ],
)
def test_execute_rejects_invalid_commentary_template_selection(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    patch_capture: list[dict[str, Any]],
    isolated_rules: None,
    selection: object,
    message: str,
) -> None:
    monkeypatch.setattr("apps.runs.views.get_session", lambda _: _session(tmp_path))
    with override_settings(RESULTS_DIR=tmp_path / "results"):
        response = APIClient().post(
            "/api/runs/execute/",
            _payload(
                as_of_date="2026-10-30",
                commentary_template_columns=selection,
            ),
            format="json",
        )
        runs = list_runs()

    assert response.status_code == 400
    assert message in response.json()["error"]
    assert patch_capture == []
    assert runs == []


def _rich_enrichment(result: Any, _as_of_date: date) -> Any:
    from dataclasses import replace

    enriched: dict[str, list[Any]] = {}
    for rule_id, violations in result.validation.violations_by_rule.items():
        rows = []
        for violation in violations:
            status = "Commented" if violation.key_columns.get("id") == "2" else "New"
            rows.append(
                replace(
                    violation,
                    exception_id=f"EXC_{violation.key_columns.get('id')}",
                    exception_status=status,
                )
            )
        enriched[rule_id] = rows
    return replace(
        result,
        validation=replace(result.validation, violations_by_rule=enriched),
    )


def test_new_exceptions_only_filters_response_but_persists_all_exceptions(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    patch_capture: list[dict[str, Any]],
    isolated_rules: None,
) -> None:
    # Both rows violate the rule; fake tracking marks row 1 New and row 2 Commented.
    monkeypatch.setattr(
        "apps.runs.services.load_rules",
        lambda: RulesFile(version=1, rules=[_never_matching_rule()], next_index=2),
    )
    monkeypatch.setattr("apps.runs.views.get_session", lambda _: _session(tmp_path))
    monkeypatch.setattr("apps.runs.views.enrich_execution_result", _rich_enrichment)
    with override_settings(RESULTS_DIR=tmp_path / "results"):
        response = APIClient().post(
            "/api/runs/execute/",
            _payload(as_of_date="2026-10-30"),
            format="json",
        )
        run_id = response.json()["run_id"]
        stored = load_run(run_id)
        filtered = APIClient().get(f"/api/runs/{run_id}/")
        unfiltered = APIClient().get(
            f"/api/runs/{run_id}/?new_exceptions_only=false"
        )

    assert response.status_code == 200
    assert response.json()["result"]["new_exceptions_only"] is True
    visible = response.json()["result"]["validation"]["violations_by_rule"]["R001"]
    assert [item["key_columns"]["id"] for item in visible] == ["1"]
    assert response.json()["result"]["validation"]["total_violations"] == 1
    # All exceptions are persisted before the display filter.
    assert stored is not None
    assert len(stored["result"]["validation"]["violations_by_rule"]["R001"]) == 2
    assert filtered.status_code == 200
    assert filtered.json()["result"]["validation"]["total_violations"] == 1
    assert unfiltered.status_code == 200
    assert unfiltered.json()["result"]["validation"]["total_violations"] == 2


def test_new_exceptions_only_false_returns_all_and_persists_false(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    patch_capture: list[dict[str, Any]],
    isolated_rules: None,
) -> None:
    monkeypatch.setattr(
        "apps.runs.services.load_rules",
        lambda: RulesFile(version=1, rules=[_never_matching_rule()], next_index=2),
    )
    monkeypatch.setattr("apps.runs.views.get_session", lambda _: _session(tmp_path))
    monkeypatch.setattr("apps.runs.views.enrich_execution_result", _rich_enrichment)
    with override_settings(RESULTS_DIR=tmp_path / "results"):
        response = APIClient().post(
            "/api/runs/execute/",
            _payload(as_of_date="2026-10-30", new_exceptions_only=False),
            format="json",
        )
        stored = load_run(response.json()["run_id"])

    assert response.status_code == 200
    assert response.json()["result"]["new_exceptions_only"] is False
    assert response.json()["result"]["validation"]["total_violations"] == 2
    assert stored is not None
    assert stored["result"]["new_exceptions_only"] is False
    assert len(stored["result"]["validation"]["violations_by_rule"]["R001"]) == 2


def test_new_exceptions_only_can_produce_an_empty_visible_result(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    patch_capture: list[dict[str, Any]],
    isolated_rules: None,
) -> None:
    from dataclasses import replace

    def all_commented(result: Any, _as_of_date: date) -> Any:
        enriched = {
            rule_id: [
                replace(
                    violation,
                    exception_id=f"EXC_{violation.key_columns.get('id')}",
                    exception_status="Commented",
                )
                for violation in violations
            ]
            for rule_id, violations in result.validation.violations_by_rule.items()
        }
        return replace(
            result,
            validation=replace(result.validation, violations_by_rule=enriched),
        )

    monkeypatch.setattr(
        "apps.runs.services.load_rules",
        lambda: RulesFile(version=1, rules=[_never_matching_rule()], next_index=2),
    )
    monkeypatch.setattr("apps.runs.views.get_session", lambda _: _session(tmp_path))
    monkeypatch.setattr("apps.runs.views.enrich_execution_result", all_commented)
    with override_settings(RESULTS_DIR=tmp_path / "results"):
        response = APIClient().post(
            "/api/runs/execute/",
            _payload(as_of_date="2026-10-30"),
            format="json",
        )
        stored = load_run(response.json()["run_id"])

    assert response.status_code == 200
    validation = response.json()["result"]["validation"]
    assert validation["total_violations"] == 0
    assert validation["distinct_violating_rows"] == 0
    assert validation["violations_by_rule"]["R001"] == []
    assert stored is not None
    assert len(stored["result"]["validation"]["violations_by_rule"]["R001"]) == 2
