"""Round 4 (Worker A): report-run vs tracking-date commentary template scope.

Report-page download = exactly the persisted exceptions captured by one run's
enabled rules (membership from the run snapshot, commentary/status from the
live date records). Tracking-tab download = all known exceptions for the
selected as-of date. Neither scope consults New Exceptions Only, screen
filters, pagination, or the current catalog.
"""

from __future__ import annotations

import io
from datetime import UTC, date, datetime
from types import SimpleNamespace
from typing import Any

import pytest
from apps.exception_tracking import api_services
from apps.exception_tracking.workbook import EXCEPTION_HEADERS, build_commentary_workbook
from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import load_workbook
from rest_framework.test import APIClient

TRACKING_DATE = date(2026, 10, 30)
OTHER_DATE = date(2026, 9, 30)


def _record(
    exception_id: str,
    as_of_date: date,
    *,
    commentary: str = "",
    status: str = "New",
    rule_index: str = "R001",
    rule_identifier: str = "CBR1_RULE",
) -> dict[str, Any]:
    return {
        "exception_id": exception_id,
        "exception_rule_identifier": rule_identifier,
        "key_columns": '{"id":"ID"}',
        "exception_timestamp": datetime(2026, 10, 30, 8, 15, tzinfo=UTC),
        "exception_commentary": commentary,
        "exception_as_of_date": as_of_date,
        "exception_first_seen_as_of_date": as_of_date,
        "exception_last_seen_as_of_date": as_of_date,
        "exception_first_seen_timestamp": datetime(2026, 9, 30, 9, 0, tzinfo=UTC),
        "exception_last_seen_timestamp": datetime(2026, 10, 30, 8, 15, tzinfo=UTC),
        "status": status,
        "rule_index": rule_index,
        "exception_rule_index": rule_index,
        "detail_values": {},
        "exception_extra_values": {},
    }


def _summary(name: str = "Rule", identifier: str = "CBR1_RULE") -> dict[str, Any]:
    return {
        "name": name,
        "rule_identifier": identifier,
        "condition_clauses": ["Condition 1: status equals 'inactive'"],
        "expectation_clauses": ["Expectation 1: status equals 'active'"],
        "condition_groupings": "",
        "expectation_groupings": "",
    }


def _run_data(
    run_id: str,
    as_of: date | None,
    ids_by_rule: dict[str, list[str]] | None,
    summaries: dict[str, dict[str, Any]] | None = None,
    created_at: str = "2026-10-30T10:00:00+00:00",
) -> dict[str, Any]:
    validation: dict[str, Any] = {}
    if ids_by_rule is not None:
        validation["violations_by_rule"] = {
            rule_id: [
                {"exception_id": exception_id, "rule_id": rule_id}
                for exception_id in ids
            ]
            for rule_id, ids in ids_by_rule.items()
        }
        validation["rule_summaries"] = summaries if summaries is not None else {}
    return {
        "run_id": run_id,
        "as_of_date": as_of.isoformat() if as_of is not None else None,
        "created_at": created_at,
        "result": {"validation": validation},
    }


class FakeRepository:
    def __init__(self) -> None:
        self.tables: dict[date, list[dict[str, Any]]] = {}
        self.update_calls: list[tuple[date, dict[str, str]]] = []

    def add(self, record: dict[str, Any]) -> None:
        self.tables.setdefault(record["exception_as_of_date"], []).append(record)

    def list_as_of_dates(self) -> list[date]:
        return sorted(self.tables)

    def list_exceptions(self, as_of_date: date) -> list[dict[str, Any]]:
        return [dict(record) for record in self.tables.get(as_of_date, [])]

    def get_extra_columns(self, as_of_date: date | None = None) -> list[str]:
        return []

    def get_extra_column_union(self) -> list[str]:
        return []

    def update_commentaries(self, as_of_date: date, updates: dict[str, str]) -> int:
        self.update_calls.append((as_of_date, dict(updates)))
        for record in self.tables.get(as_of_date, []):
            if record["exception_id"] in updates:
                record["exception_commentary"] = updates[record["exception_id"]]
        return len(updates)


@pytest.fixture
def repository(monkeypatch: pytest.MonkeyPatch) -> FakeRepository:
    fake = FakeRepository()
    monkeypatch.setattr(api_services, "get_repository", lambda: fake)
    monkeypatch.setattr(api_services, "_BUILD_SUPPORTED_PARAMS", None)
    return fake


@pytest.fixture
def runs(monkeypatch: pytest.MonkeyPatch) -> dict[str, dict[str, Any]]:
    store: dict[str, dict[str, Any]] = {}

    def fake_load_run(run_id: str) -> dict[str, Any] | None:
        return store.get(run_id)

    def fake_list_runs() -> list[Any]:
        return [
            SimpleNamespace(
                run_id=run_id,
                as_of_date=data["as_of_date"],
                created_at=data["created_at"],
            )
            for run_id, data in store.items()
        ]

    monkeypatch.setattr("apps.runs.persistence.load_run", fake_load_run)
    monkeypatch.setattr("apps.runs.persistence.list_runs", fake_list_runs)
    return store


def _upload(content: bytes) -> SimpleUploadedFile:
    return SimpleUploadedFile(
        "template.xlsx",
        content,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


def _exception_ids(content: bytes) -> list[str]:
    sheet = load_workbook(io.BytesIO(content))["Exceptions"]
    return [row[0].value for row in list(sheet.iter_rows(min_row=2)) if row[0].value]


def _template_headers(content: bytes) -> list[str]:
    return [cell.value for cell in load_workbook(io.BytesIO(content))["Exceptions"][1]]


def test_report_exports_contain_only_own_run_membership(
    repository: FakeRepository, runs: dict[str, dict[str, Any]]
) -> None:
    """Two runs on one date: overlapping + disjoint rules/exception IDs."""
    repository.add(_record("SHARED", TRACKING_DATE, rule_index="R001"))
    repository.add(_record("ONLY_A", TRACKING_DATE, rule_index="R001"))
    repository.add(_record("ONLY_B", TRACKING_DATE, rule_index="R002"))
    runs["run-a"] = _run_data(
        "run-a",
        TRACKING_DATE,
        {"R001": ["SHARED", "ONLY_A"]},
        {"R001": _summary("First")},
    )
    runs["run-b"] = _run_data(
        "run-b",
        TRACKING_DATE,
        {"R001": ["SHARED"], "R002": ["ONLY_B"]},
        {"R001": _summary("First"), "R002": _summary("Second")},
    )
    runs["run-a"]["report_name"] = "October comparison"
    runs["run-a"]["result"]["validation"]["rule_summaries"]["R001"]["description"] = (
        "Check the saved rule description"
    )

    run_a = APIClient().get("/api/exception-tracking/export/?run_id=run-a")
    run_b = APIClient().get("/api/exception-tracking/export/?run_id=run-b")
    tracking = APIClient().get(
        f"/api/exception-tracking/export/?as_of_date={TRACKING_DATE.isoformat()}"
    )

    assert run_a.status_code == run_b.status_code == tracking.status_code == 200
    template = load_workbook(io.BytesIO(run_a.content))["Template"]
    assert template["A5"].value == "Instructions"
    assert template["A6"].value == "Report Name"
    assert template["B6"].value == "October comparison"
    assert template["G8"].value == "Description"
    assert template["G9"].value == "Check the saved rule description"
    assert sorted(_exception_ids(run_a.content)) == ["ONLY_A", "SHARED"]
    assert sorted(_exception_ids(run_b.content)) == ["ONLY_B", "SHARED"]
    assert sorted(_exception_ids(tracking.content)) == ["ONLY_A", "ONLY_B", "SHARED"]
    # Filenames stay date-based in both scopes for import compatibility.
    assert "2026-10-30" in run_a["Content-Disposition"]
    assert "2026-10-30" in tracking["Content-Disposition"]


def test_later_same_date_recapture_preserves_older_run_membership(
    repository: FakeRepository, runs: dict[str, dict[str, Any]]
) -> None:
    repository.add(_record("OLD_1", TRACKING_DATE))
    repository.add(_record("OLD_2", TRACKING_DATE))
    repository.add(_record("NEW_1", TRACKING_DATE))
    runs["run-old"] = _run_data("run-old", TRACKING_DATE, {"R001": ["OLD_1", "OLD_2"]})
    runs["run-new"] = _run_data(
        "run-new", TRACKING_DATE, {"R001": ["OLD_1", "OLD_2", "NEW_1"]}
    )

    reopened = APIClient().get("/api/exception-tracking/export/?run_id=run-old")
    assert reopened.status_code == 200
    assert sorted(_exception_ids(reopened.content)) == ["OLD_1", "OLD_2"]


def test_disabled_rule_excluded_from_report_but_present_in_date(
    repository: FakeRepository, runs: dict[str, dict[str, Any]]
) -> None:
    """Run A ran while R002 was disabled; run B later captured R002."""
    repository.add(_record("R1_ROW", TRACKING_DATE, rule_index="R001"))
    repository.add(
        _record("R2_ROW", TRACKING_DATE, rule_index="R002", rule_identifier="CBR1_OTHER")
    )
    runs["run-a"] = _run_data("run-a", TRACKING_DATE, {"R001": ["R1_ROW"]})

    response = APIClient().get("/api/exception-tracking/export/?run_id=run-a")
    assert response.status_code == 200
    assert _exception_ids(response.content) == ["R1_ROW"]


def test_repeated_rule_identity_across_dates(
    repository: FakeRepository, runs: dict[str, dict[str, Any]]
) -> None:
    """Same R001 index, different canonical identifiers on different dates."""
    repository.add(
        _record("SEP_ROW", OTHER_DATE, rule_identifier="CBR1_SEP", rule_index="R001")
    )
    repository.add(
        _record("OCT_ROW", TRACKING_DATE, rule_identifier="CBR1_OCT", rule_index="R001")
    )
    runs["run-sep"] = _run_data("run-sep", OTHER_DATE, {"R001": ["SEP_ROW"]})
    runs["run-oct"] = _run_data("run-oct", TRACKING_DATE, {"R001": ["OCT_ROW"]})

    september = APIClient().get("/api/exception-tracking/export/?run_id=run-sep")
    october = APIClient().get("/api/exception-tracking/export/?run_id=run-oct")
    assert september.status_code == october.status_code == 200
    assert _exception_ids(september.content) == ["SEP_ROW"]
    assert _exception_ids(october.content) == ["OCT_ROW"]


def test_empty_run_yields_empty_valid_template(
    repository: FakeRepository, runs: dict[str, dict[str, Any]]
) -> None:
    runs["run-empty"] = _run_data(
        "run-empty",
        TRACKING_DATE,
        {"R001": []},
        {"R001": _summary()},
        created_at="2026-10-30T11:00:00+00:00",
    )

    response = APIClient().get("/api/exception-tracking/export/?run_id=run-empty")
    assert response.status_code == 200
    assert _exception_ids(response.content) == []
    assert _template_headers(response.content) == list(EXCEPTION_HEADERS)
    assert load_workbook(io.BytesIO(response.content))["Template"]["B3"].value == (
        TRACKING_DATE.isoformat()
    )

    # The empty template round-trips through import without touching the date.
    uploaded = APIClient().post(
        "/api/exception-tracking/import/",
        {"file": _upload(response.content)},
        format="multipart",
    )
    assert uploaded.status_code == 200
    assert uploaded.json()["total"] == 0
    assert repository.update_calls == []


def test_new_exceptions_only_does_not_narrow_report_export(
    repository: FakeRepository, runs: dict[str, dict[str, Any]]
) -> None:
    repository.add(_record("NEW_ROW", TRACKING_DATE, status="New"))
    repository.add(_record("COMMENTED_ROW", TRACKING_DATE, status="Commented"))
    runs["run-full"] = _run_data(
        "run-full", TRACKING_DATE, {"R001": ["NEW_ROW", "COMMENTED_ROW"]}
    )

    response = APIClient().get("/api/exception-tracking/export/?run_id=run-full")
    assert response.status_code == 200
    # Both rows are present even though a New Exceptions Only display view
    # would hide COMMENTED_ROW.
    assert sorted(_exception_ids(response.content)) == ["COMMENTED_ROW", "NEW_ROW"]


def test_commentary_edits_are_visible_in_later_run_export(
    repository: FakeRepository, runs: dict[str, dict[str, Any]]
) -> None:
    repository.add(_record("SHARED", TRACKING_DATE, commentary="before"))
    runs["run-a"] = _run_data("run-a", TRACKING_DATE, {"R001": ["SHARED"]})

    repository.tables[TRACKING_DATE][0]["exception_commentary"] = "after"
    response = APIClient().get("/api/exception-tracking/export/?run_id=run-a")
    sheet = load_workbook(io.BytesIO(response.content))["Exceptions"]
    assert sheet["C2"].value == "after"


def test_export_validates_run_scope_explicitly(
    repository: FakeRepository, runs: dict[str, dict[str, Any]]
) -> None:
    client = APIClient()

    missing = client.get("/api/exception-tracking/export/?run_id=no-such-run")
    assert missing.status_code == 404
    assert missing.json()["code"] == "run_not_found"

    both = client.get(
        "/api/exception-tracking/export/?as_of_date=2026-10-30&run_id=run-a"
    )
    assert both.status_code == 400

    runs["run-no-date"] = _run_data("run-no-date", None, {"R001": ["X"]})
    no_date = client.get("/api/exception-tracking/export/?run_id=run-no-date")
    assert no_date.status_code == 400
    assert no_date.json()["code"] == "run_has_no_as_of_date"

    # A legacy snapshot without stored violations must never fall back to
    # date-wide records.
    repository.add(_record("DATE_ROW", TRACKING_DATE))
    runs["run-legacy"] = _run_data("run-legacy", TRACKING_DATE, None)
    legacy = client.get("/api/exception-tracking/export/?run_id=run-legacy")
    assert legacy.status_code == 400
    assert legacy.json()["code"] == "run_has_no_tracking_snapshot"

    runs["run-no-ids"] = {
        "run_id": "run-no-ids",
        "as_of_date": TRACKING_DATE.isoformat(),
        "created_at": "2026-10-30T10:00:00+00:00",
        "result": {
            "validation": {
                "violations_by_rule": {"R001": [{"rule_id": "R001"}]},
                "rule_summaries": {},
            }
        },
    }
    no_ids = client.get("/api/exception-tracking/export/?run_id=run-no-ids")
    assert no_ids.status_code == 400
    assert no_ids.json()["code"] == "run_has_no_tracking_snapshot"


def test_missing_tracking_context_is_explicit(
    repository: FakeRepository, runs: dict[str, dict[str, Any]]
) -> None:
    repository.add(_record("PRESENT", TRACKING_DATE))
    runs["run-stale"] = _run_data(
        "run-stale", TRACKING_DATE, {"R001": ["PRESENT", "ABSENT"]}
    )

    response = APIClient().get("/api/exception-tracking/export/?run_id=run-stale")
    assert response.status_code == 500
    assert response.json()["code"] == "tracking_context_missing"
    assert response.json()["details"]["missing_ids"] == ["ABSENT"]


def test_subset_template_import_preserves_unrelated_commentary(
    repository: FakeRepository,
) -> None:
    repository.add(_record("A", TRACKING_DATE, commentary="keep A"))
    repository.add(_record("B", TRACKING_DATE, commentary="keep B"))

    # A valid run subset (only A's row, edited commentary) uploads through
    # the date endpoint without clearing B.
    subset = build_commentary_workbook(
        [_record("A", TRACKING_DATE, commentary="reviewed A")], TRACKING_DATE
    )
    response = APIClient().post(
        "/api/exception-tracking/import/",
        {"file": _upload(subset), "as_of_date": TRACKING_DATE.isoformat()},
        format="multipart",
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["updated"] == 1
    assert payload["cleared"] == 0
    assert payload["total"] == 2
    assert payload["scope"] == "date"
    by_id = {item["exception_id"]: item for item in payload["exceptions"]}
    assert by_id["A"]["exception_commentary"] == "reviewed A"
    assert by_id["B"]["exception_commentary"] == "keep B"
    assert repository.update_calls == [(TRACKING_DATE, {"A": "reviewed A"})]

    # A full date-wide upload still works after the partial one.
    full = build_commentary_workbook(
        [
            _record("A", TRACKING_DATE, commentary="reviewed A"),
            _record("B", TRACKING_DATE, commentary="reviewed B"),
        ],
        TRACKING_DATE,
    )
    full_response = APIClient().post(
        "/api/exception-tracking/import/",
        {"file": _upload(full)},
        format="multipart",
    )
    assert full_response.status_code == 200
    assert full_response.json()["updated"] == 1


def test_date_import_still_rejects_unknown_and_duplicate_ids(
    repository: FakeRepository,
) -> None:
    repository.add(_record("A", TRACKING_DATE))
    repository.add(_record("B", TRACKING_DATE))

    unknown = build_commentary_workbook(
        [_record("A", TRACKING_DATE), _record("X", TRACKING_DATE)], TRACKING_DATE
    )
    response = APIClient().post(
        "/api/exception-tracking/import/",
        {"file": _upload(unknown)},
        format="multipart",
    )
    assert response.status_code == 400
    assert response.json()["code"] == "unknown_exception_ids"

    duplicate = load_workbook(io.BytesIO(build_commentary_workbook(
        [_record("A", TRACKING_DATE)], TRACKING_DATE
    )))
    duplicate["Exceptions"].append(["A", "", "", "", "", "", "", "", ""])
    buffer = io.BytesIO()
    duplicate.save(buffer)
    duplicate_response = APIClient().post(
        "/api/exception-tracking/import/",
        {"file": _upload(buffer.getvalue())},
        format="multipart",
    )
    assert duplicate_response.status_code == 400
    assert duplicate_response.json()["code"] == "duplicate_exception_ids"
    assert repository.update_calls == []


def test_run_scoped_import_requires_exact_membership(
    repository: FakeRepository, runs: dict[str, dict[str, Any]]
) -> None:
    repository.add(_record("A", TRACKING_DATE, commentary="a"))
    repository.add(_record("B", TRACKING_DATE, commentary="b"))
    runs["run-a"] = _run_data("run-a", TRACKING_DATE, {"R001": ["A", "B"]})

    # Trimmed run template (B removed) is rejected, not silently applied.
    trimmed = build_commentary_workbook([_record("A", TRACKING_DATE)], TRACKING_DATE)
    response = APIClient().post(
        "/api/exception-tracking/import/",
        {"file": _upload(trimmed), "run_id": "run-a"},
        format="multipart",
    )
    assert response.status_code == 400
    assert response.json()["code"] == "missing_exception_ids"
    assert response.json()["details"]["missing_ids"] == ["B"]
    assert repository.update_calls == []

    # Exact membership with edited commentary succeeds and reports run scope.
    exact = build_commentary_workbook(
        [
            _record("A", TRACKING_DATE, commentary="new A"),
            _record("B", TRACKING_DATE, commentary="b"),
        ],
        TRACKING_DATE,
    )
    ok_response = APIClient().post(
        "/api/exception-tracking/import/",
        {"file": _upload(exact), "run_id": "run-a"},
        format="multipart",
    )
    assert ok_response.status_code == 200
    assert ok_response.json()["scope"] == "run"
    assert ok_response.json()["run_id"] == "run-a"
    assert ok_response.json()["updated"] == 1

    # A workbook from another date never matches the run's date.
    other = build_commentary_workbook(
        [_record("A", OTHER_DATE), _record("B", OTHER_DATE)], OTHER_DATE
    )
    mismatch = APIClient().post(
        "/api/exception-tracking/import/",
        {"file": _upload(other), "run_id": "run-a"},
        format="multipart",
    )
    assert mismatch.status_code == 400
    assert mismatch.json()["code"] == "date_mismatch"

    unknown_run = APIClient().post(
        "/api/exception-tracking/import/",
        {"file": _upload(exact), "run_id": "no-such-run"},
        format="multipart",
    )
    assert unknown_run.status_code == 404
    assert unknown_run.json()["code"] == "run_not_found"


def test_run_summaries_reach_workbook_only_when_supported(
    repository: FakeRepository,
    runs: dict[str, dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The run snapshot (incl. zero-exception enabled rules) is forwarded.

    Worker B owns rendering; A only selects and passes the scope-specific
    snapshots. Forwarding is conditional on the installed workbook signature
    so this module works before and after B's input lands.
    """
    repository.add(_record("ONLY_A", TRACKING_DATE, rule_index="R001"))
    summaries = {
        "R001": _summary("Populated"),
        # Enabled with zero exceptions: no violations, but still summarized.
        "R002": _summary("Empty but enabled", "CBR1_EMPTY"),
    }
    runs["run-a"] = _run_data(
        "run-a", TRACKING_DATE, {"R001": ["ONLY_A"], "R002": []}, summaries
    )

    captured: dict[str, Any] = {}

    def fake_build(
        records: Any,
        as_of_date: Any,
        *,
        generated_at: Any = None,
        detail_columns: Any = (),
        detail_values: Any = None,
        rule_summaries: Any = None,
        rule_snapshot_notes: Any = (),
    ) -> bytes:
        captured["rule_summaries"] = rule_summaries
        captured["record_count"] = len(list(records))
        return b"workbook-bytes"

    monkeypatch.setattr(api_services, "build_commentary_workbook", fake_build)
    monkeypatch.setattr(
        api_services, "_BUILD_SUPPORTED_PARAMS", {"rule_summaries", "rule_snapshot_notes"}
    )

    content, _ = api_services.export_run_commentary("run-a")
    assert content == b"workbook-bytes"
    assert captured["record_count"] == 1
    assert captured["rule_summaries"] == summaries

    # Date scope unions snapshots with first run winning per rule index
    # (integrator-resolved A/B policy); differing snapshots surface as notes.
    runs["run-b"] = _run_data(
        "run-b",
        TRACKING_DATE,
        {"R001": ["ONLY_A"]},
        {"R001": _summary("Later differs")},
        created_at="2026-10-30T12:00:00+00:00",
    )
    api_services.export_commentary(TRACKING_DATE, repository)
    assert captured["rule_summaries"] == {
        "R001": _summary("Populated"),
        "R002": _summary("Empty but enabled", "CBR1_EMPTY"),
    }


def test_workbook_without_summary_input_still_exports_rows(
    repository: FakeRepository,
    runs: dict[str, dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Forward compatibility: the current workbook has no rule_summaries input."""

    def legacy_build(
        records: Any,
        as_of_date: Any,
        *,
        generated_at: Any = None,
        detail_columns: Any = (),
        detail_values: Any = None,
    ) -> bytes:
        return build_commentary_workbook(
            list(records),
            as_of_date,
            generated_at=generated_at,
            detail_columns=detail_columns,
            detail_values=detail_values,
        )

    repository.add(_record("ONLY_A", TRACKING_DATE))
    runs["run-a"] = _run_data(
        "run-a", TRACKING_DATE, {"R001": ["ONLY_A"]}, {"R001": _summary()}
    )
    monkeypatch.setattr(api_services, "build_commentary_workbook", legacy_build)
    monkeypatch.setattr(api_services, "_BUILD_SUPPORTED_PARAMS", set())

    content, as_of_date = api_services.export_run_commentary("run-a")
    assert as_of_date == TRACKING_DATE
    assert _exception_ids(content) == ["ONLY_A"]
