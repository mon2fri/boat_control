from __future__ import annotations

import io
from datetime import UTC, date, datetime
from datetime import timezone as datetime_timezone
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from apps.exception_tracking import api_services
from apps.exception_tracking.dates import default_as_of_date
from apps.exception_tracking.workbook import EXCEPTION_HEADERS, build_commentary_workbook
from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import load_workbook
from rest_framework.test import APIClient

TRACKING_DATE = date(2026, 10, 30)
PRIOR_DATE = date(2026, 9, 30)


def _record(
    exception_id: str,
    as_of_date: date,
    *,
    commentary: str = "",
    first_seen: date | None = None,
    status: str | None = None,
) -> dict[str, Any]:
    first = first_seen or as_of_date
    if status is None:
        if commentary.strip():
            status = "Commented"
        elif first == as_of_date:
            status = "New"
        else:
            status = "NotCommented"
    return {
        "exception_id": exception_id,
        "exception_rule_identifier": "CBR1_RULE",
        "key_columns": '{"id":"ID"}',
        "exception_timestamp": datetime(2026, 10, 30, 8, 15, tzinfo=UTC),
        "exception_commentary": commentary,
        "exception_as_of_date": as_of_date,
        "exception_first_seen_as_of_date": first,
        "exception_last_seen_as_of_date": as_of_date,
        "exception_first_seen_timestamp": datetime(2026, 9, 30, 9, 0, tzinfo=UTC),
        "exception_last_seen_timestamp": datetime(2026, 10, 30, 8, 15, tzinfo=UTC),
        "status": status,
    }


class FakeRepository:
    """Small contract fixture; production storage is Worker A's repository."""

    def __init__(self) -> None:
        self.tables: dict[date, list[dict[str, Any]]] = {}
        self.update_calls: list[tuple[date, dict[str, str]]] = []
        self.fail_update = False

    def add(self, record: dict[str, Any]) -> None:
        self.tables.setdefault(record["exception_as_of_date"], []).append(record)

    def list_as_of_dates(self) -> list[date]:
        return sorted(self.tables)

    def list_exceptions(self, as_of_date: date) -> list[dict[str, Any]]:
        return [dict(record) for record in self.tables.get(as_of_date, [])]

    def update_commentaries(self, as_of_date: date, updates: dict[str, str]) -> int:
        self.update_calls.append((as_of_date, dict(updates)))
        if self.fail_update:
            raise ValueError("simulated write failure")
        for record in self.tables.get(as_of_date, []):
            if record["exception_id"] not in updates:
                continue
            record["exception_commentary"] = updates[record["exception_id"]]
            if record["exception_commentary"].strip():
                record["status"] = "Commented"
            elif record["exception_first_seen_as_of_date"] == as_of_date:
                record["status"] = "New"
            else:
                record["status"] = "NotCommented"
        return len(updates)


@pytest.fixture
def repository(monkeypatch: pytest.MonkeyPatch) -> FakeRepository:
    fake = FakeRepository()
    monkeypatch.setattr(api_services, "get_repository", lambda: fake)
    return fake


def _template(records: list[dict[str, Any]], as_of_date: date = TRACKING_DATE) -> bytes:
    return build_commentary_workbook(records, as_of_date)


def _upload(content: bytes, *, name: str = "template.xlsx") -> SimpleUploadedFile:
    return SimpleUploadedFile(
        name,
        content,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


def test_dates_endpoint_returns_available_dates_and_backend_default(
    repository: FakeRepository,
) -> None:
    repository.add(_record("A", PRIOR_DATE))
    repository.add(_record("B", TRACKING_DATE))

    response = APIClient().get("/api/exception-tracking/dates/")

    assert response.status_code == 200
    assert response.json() == {
        "dates": ["2026-09-30", "2026-10-30"],
        "default_as_of_date": default_as_of_date().isoformat(),
    }


def test_list_endpoint_returns_status_and_uses_explicit_date(
    repository: FakeRepository,
) -> None:
    repository.add(_record("A", TRACKING_DATE, first_seen=PRIOR_DATE))
    repository.add(_record("B", TRACKING_DATE, commentary="Known"))

    response = APIClient().get(
        f"/api/exception-tracking/?as_of_date={TRACKING_DATE.isoformat()}"
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["as_of_date"] == "2026-10-30"
    assert payload["total"] == 2
    assert [item["exception_id"] for item in payload["exceptions"]] == ["A", "B"]
    assert [item["status"] for item in payload["exceptions"]] == ["NotCommented", "Commented"]
    assert payload["exceptions"][0]["exception_timestamp"] == "2026-10-30T08:15:00+00:00"
    assert payload["exceptions"][0]["exception_as_of_date"] == "2026-10-30"


def test_list_endpoint_uses_backend_default_date(repository: FakeRepository) -> None:
    default = default_as_of_date()
    repository.add(_record("DEFAULT", default))

    response = APIClient().get("/api/exception-tracking/")

    assert response.status_code == 200
    assert response.json()["as_of_date"] == default.isoformat()


def test_list_endpoint_rejects_invalid_date(repository: FakeRepository) -> None:
    response = APIClient().get("/api/exception-tracking/?as_of_date=30-10-2026")

    assert response.status_code == 400
    assert response.json()["code"] == "invalid_as_of_date"


@pytest.mark.parametrize("value", ["", " 2026-10-30", "2026-10-30 "])
def test_supplied_as_of_date_rejects_blank_or_padded_values(value: str) -> None:
    with pytest.raises(api_services.TrackingAPIError) as error:
        api_services.resolve_as_of_date(value)

    assert error.value.code == "invalid_as_of_date"


def test_default_date_uses_django_configured_timezone(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FrozenDateTime(datetime):
        @classmethod
        def now(cls, tz: datetime_timezone | None = None) -> datetime:
            utc_now = datetime(2026, 11, 1, 2, 0, tzinfo=UTC)
            return utc_now.astimezone(tz) if tz is not None else utc_now

    monkeypatch.setattr("apps.exception_tracking.dates.datetime", FrozenDateTime)
    monkeypatch.setattr(
        "apps.exception_tracking.dates.timezone.get_default_timezone",
        lambda: ZoneInfo("Etc/GMT+12"),
    )

    # 2026-11-01 UTC is still 2026-10-31 in UTC-12; the previous-month
    # last weekday is therefore September 30, not October 30.
    assert default_as_of_date() == date(2026, 9, 30)


def test_export_returns_prefilled_xlsx_attachment(repository: FakeRepository) -> None:
    repository.add(_record("A", TRACKING_DATE, commentary="Known upstream defect"))

    response = APIClient().get(
        f"/api/exception-tracking/export/?as_of_date={TRACKING_DATE.isoformat()}"
    )

    assert response.status_code == 200
    assert response["Content-Type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert "exception_commentary_2026-10-30.xlsx" in response["Content-Disposition"]
    workbook = load_workbook(io.BytesIO(response.content))
    assert workbook["Template"]["B3"].value == "2026-10-30"
    assert workbook["Exceptions"]["A2"].value == "A"
    assert workbook["Exceptions"]["E2"].value == "Known upstream defect"


def test_export_resolves_date_from_run_metadata(
    repository: FakeRepository, monkeypatch: pytest.MonkeyPatch
) -> None:
    repository.add(_record("A", TRACKING_DATE))
    monkeypatch.setattr(
        "apps.runs.persistence.load_run",
        lambda run_id: {"run_id": run_id, "as_of_date": "2026-10-30"},
    )

    response = APIClient().get("/api/exception-tracking/export/?run_id=run123")

    assert response.status_code == 200
    workbook = load_workbook(io.BytesIO(response.content))
    assert workbook["Template"]["B3"].value == "2026-10-30"


def test_export_reports_missing_run_and_run_without_date(
    repository: FakeRepository, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("apps.runs.persistence.load_run", lambda run_id: None)
    missing = APIClient().get("/api/exception-tracking/export/?run_id=missing")
    assert missing.status_code == 404
    assert missing.json()["code"] == "run_not_found"

    monkeypatch.setattr(
        "apps.runs.persistence.load_run",
        lambda run_id: {"run_id": run_id, "as_of_date": None},
    )
    no_date = APIClient().get("/api/exception-tracking/export/?run_id=legacy")
    assert no_date.status_code == 400
    assert no_date.json()["code"] == "run_has_no_as_of_date"


def test_export_rejects_both_date_and_run_id(repository: FakeRepository) -> None:
    response = APIClient().get(
        "/api/exception-tracking/export/?as_of_date=2026-10-30&run_id=run123"
    )
    assert response.status_code == 400


def test_import_updates_and_clears_commentary(repository: FakeRepository) -> None:
    repository.add(_record("A", TRACKING_DATE, commentary="old", first_seen=PRIOR_DATE))
    repository.add(_record("B", TRACKING_DATE, commentary="keep", first_seen=PRIOR_DATE))
    content = _template(
        [
            _record("A", TRACKING_DATE, commentary=""),
            _record("B", TRACKING_DATE, commentary="keep"),
        ]
    )

    response = APIClient().post(
        "/api/exception-tracking/import/",
        {"file": _upload(content), "as_of_date": TRACKING_DATE.isoformat()},
        format="multipart",
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["updated"] == 0
    assert payload["cleared"] == 1
    assert payload["unchanged"] == 1
    assert repository.update_calls == [(TRACKING_DATE, {"A": ""})]
    assert payload["exceptions"][0]["exception_commentary"] == ""
    assert payload["exceptions"][0]["status"] == "NotCommented"


def test_import_writes_new_commentary(repository: FakeRepository) -> None:
    repository.add(_record("A", TRACKING_DATE))
    content = _template([_record("A", TRACKING_DATE, commentary="Reviewed")])

    response = APIClient().post(
        "/api/exception-tracking/import/",
        {"file": _upload(content)},
        format="multipart",
    )

    assert response.status_code == 200
    assert response.json()["updated"] == 1
    assert response.json()["as_of_date"] == "2026-10-30"
    assert repository.tables[TRACKING_DATE][0]["exception_commentary"] == "Reviewed"
    assert response.json()["exceptions"][0]["status"] == "Commented"


def test_import_rejects_date_mismatch_before_any_write(
    repository: FakeRepository,
) -> None:
    repository.add(_record("A", TRACKING_DATE))
    content = _template([_record("A", TRACKING_DATE)], as_of_date=TRACKING_DATE)

    response = APIClient().post(
        "/api/exception-tracking/import/",
        {"file": _upload(content), "as_of_date": PRIOR_DATE.isoformat()},
        format="multipart",
    )

    assert response.status_code == 400
    assert response.json()["code"] == "date_mismatch"
    assert repository.update_calls == []


def test_import_rejects_unknown_duplicate_and_missing_ids_atomically(
    repository: FakeRepository,
) -> None:
    repository.add(_record("A", TRACKING_DATE))
    repository.add(_record("B", TRACKING_DATE))

    unknown = _template(
        [_record("A", TRACKING_DATE), _record("B", TRACKING_DATE), _record("X", TRACKING_DATE)]
    )
    response = APIClient().post(
        "/api/exception-tracking/import/",
        {"file": _upload(unknown)},
        format="multipart",
    )
    assert response.status_code == 400
    assert response.json()["code"] == "unknown_exception_ids"
    assert response.json()["details"]["unknown_ids"] == ["X"]

    missing = _template([_record("A", TRACKING_DATE)])
    response = APIClient().post(
        "/api/exception-tracking/import/",
        {"file": _upload(missing)},
        format="multipart",
    )
    assert response.status_code == 400
    assert response.json()["code"] == "missing_exception_ids"
    assert response.json()["details"]["missing_ids"] == ["B"]

    duplicate = load_workbook(io.BytesIO(_template([_record("A", TRACKING_DATE)])))
    duplicate["Exceptions"].append(["A", "", "", "", "", "", "", "", ""])
    duplicate_buffer = io.BytesIO()
    duplicate.save(duplicate_buffer)
    response = APIClient().post(
        "/api/exception-tracking/import/",
        {"file": _upload(duplicate_buffer.getvalue())},
        format="multipart",
    )
    assert response.status_code == 400
    assert response.json()["code"] == "duplicate_exception_ids"
    assert repository.update_calls == []


def test_import_rolls_back_cleanly_when_repository_update_fails(
    repository: FakeRepository,
) -> None:
    repository.add(_record("A", TRACKING_DATE, commentary="original"))
    repository.fail_update = True
    content = _template([_record("A", TRACKING_DATE, commentary="changed")])

    response = APIClient().post(
        "/api/exception-tracking/import/",
        {"file": _upload(content)},
        format="multipart",
    )

    assert response.status_code == 400
    assert response.json()["code"] == "tracking_update_failed"
    assert repository.tables[TRACKING_DATE][0]["exception_commentary"] == "original"


def test_import_rejects_wrong_file_type_and_malformed_workbook(
    repository: FakeRepository,
) -> None:
    wrong_type = APIClient().post(
        "/api/exception-tracking/import/",
        {"file": _upload(b"data", name="template.csv")},
        format="multipart",
    )
    assert wrong_type.status_code == 400

    malformed = APIClient().post(
        "/api/exception-tracking/import/",
        {"file": _upload(b"not an xlsx")},
        format="multipart",
    )
    assert malformed.status_code == 400
    assert malformed.json()["code"] == "invalid_workbook"


def test_empty_date_template_round_trips(repository: FakeRepository) -> None:
    export = APIClient().get(
        f"/api/exception-tracking/export/?as_of_date={TRACKING_DATE.isoformat()}"
    )
    assert export.status_code == 200

    response = APIClient().post(
        "/api/exception-tracking/import/",
        {"file": _upload(export.content)},
        format="multipart",
    )

    assert response.status_code == 200
    assert response.json()["total"] == 0
    assert repository.update_calls == []


DETAIL_EXCEPTION_ID = "CBR1_RULE_ID_Alice"


def _detail_record(
    exception_id: str = DETAIL_EXCEPTION_ID, commentary: str = ""
) -> dict[str, Any]:
    record = _record(exception_id, TRACKING_DATE, commentary=commentary)
    record["key_columns"] = '{"id":"ID","name":"Alice"}'
    return record


def _detail_run(
    exception_id: str = DETAIL_EXCEPTION_ID, *, score: str = "10", rule_id: str = "R001"
) -> dict[str, Any]:
    return {
        "run_id": "run-details",
        "as_of_date": TRACKING_DATE.isoformat(),
        "result": {
            "key_columns": ["id", "name"],
            "aggregation_columns": ["status", "region"],
            "aggregation_column_labels": {"status": "Status", "region": "Region"},
            "exception_columns": ["name", "status", "region", "id", "score"],
            "rule_bindings": {},
            "validation": {
                "rule_summaries": {
                    rule_id: {"rule_identifier": "CBR1_RULE", "name": "Rule"}
                },
                "violations_by_rule": {
                    rule_id: [
                        {
                            "exception_id": exception_id,
                            "rule_identifier": "CBR1_RULE",
                            "key_columns": {"id": "ID", "name": "Alice"},
                            "grouping_values": {
                                "status": "active",
                                "region": "EMEA",
                            },
                            "extra_values": {
                                "name": "Alice",
                                "status": "active",
                                "region": "EMEA",
                                "id": "ID",
                                "score": score,
                            },
                        }
                    ]
                },
            },
        },
    }


def test_export_appends_ordered_exception_detail_columns(
    repository: FakeRepository, monkeypatch: pytest.MonkeyPatch
) -> None:
    repository.add(_detail_record(commentary="Known"))
    monkeypatch.setattr(api_services, "_runs_for_date", lambda _: [_detail_run()])

    response = APIClient().get(
        f"/api/exception-tracking/export/?as_of_date={TRACKING_DATE.isoformat()}"
    )

    assert response.status_code == 200
    sheet = load_workbook(io.BytesIO(response.content))["Exceptions"]
    headers = [cell.value for cell in sheet[1]]
    assert headers[:9] == list(EXCEPTION_HEADERS)
    assert headers[9:] == ["id", "name", "Rule Index", "Region", "score"]
    assert [cell.value for cell in sheet[2]][9:] == [
        "ID",
        "Alice",
        "R001",
        "EMEA",
        "10",
    ]


def test_detail_resolver_uses_newest_run_and_old_run_fallback_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    older = _detail_run(score="5")
    newer = _detail_run(score="99")
    newer["result"]["validation"]["violations_by_rule"]["R001"][0].pop("exception_id")
    monkeypatch.setattr(api_services, "_runs_for_date", lambda _: [newer, older])
    records = [_detail_record()]

    headers, details = api_services.resolve_exception_details(TRACKING_DATE, records)

    assert headers == ("id", "name", "Rule Index", "Region", "score")
    assert details[DETAIL_EXCEPTION_ID]["score"] == "99"
    assert details[DETAIL_EXCEPTION_ID]["id"] == "ID"


def test_detail_resolver_maps_values_for_multiple_rule_types(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    first_id = DETAIL_EXCEPTION_ID
    second_id = "CBR1_OTHER_RULE_ID_Bob"
    run = _detail_run(exception_id=first_id, score="10")
    validation = run["result"]["validation"]
    validation["rule_summaries"]["R002"] = {
        "rule_identifier": "CBR1_OTHER_RULE",
        "name": "Score comparison",
        "logic": "score greater than baseline value",
    }
    validation["violations_by_rule"]["R002"] = [
        {
            "exception_id": second_id,
            "rule_identifier": "CBR1_OTHER_RULE",
            "key_columns": {"id": "ID2", "name": "Bob"},
            "grouping_values": {"status": "inactive", "region": "APAC"},
            "extra_values": {
                "name": "Bob",
                "status": "inactive",
                "region": "APAC",
                "id": "ID2",
                "score": 20,
            },
        }
    ]
    first_record = _detail_record(first_id)
    second_record = _detail_record(second_id)
    second_record["key_columns"] = '{"id":"ID2","name":"Bob"}'
    monkeypatch.setattr(api_services, "_runs_for_date", lambda _: [run])

    headers, details = api_services.resolve_exception_details(
        TRACKING_DATE, [first_record, second_record]
    )

    assert headers == ("id", "name", "Rule Index", "Region", "score")
    assert details[first_id] == {
        "id": "ID",
        "name": "Alice",
        "Rule Index": "R001",
        "Region": "EMEA",
        "score": "10",
    }
    assert details[second_id] == {
        "id": "ID2",
        "name": "Bob",
        "Rule Index": "R002",
        "Region": "APAC",
        "score": "20",
    }


def test_detail_resolver_obeys_exception_table_extra_column_visibility(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    run = _detail_run()
    run["result"]["extra_column_display"] = {"exception_tables": False}
    monkeypatch.setattr(api_services, "_runs_for_date", lambda _: [run])

    headers, details = api_services.resolve_exception_details(
        TRACKING_DATE, [_detail_record()]
    )

    assert headers == ("id", "name", "Rule Index", "Region")
    assert "score" not in details[DETAIL_EXCEPTION_ID]


def test_detail_resolver_does_not_guess_when_historical_identity_is_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    run = _detail_run()
    violation = run["result"]["validation"]["violations_by_rule"]["R001"][0]
    violation.pop("exception_id")
    violation.pop("rule_identifier")
    run["result"]["validation"]["rule_summaries"]["R001"].pop("rule_identifier")
    monkeypatch.setattr(api_services, "_runs_for_date", lambda _: [run])

    headers, details = api_services.resolve_exception_details(
        TRACKING_DATE, [_detail_record()]
    )

    assert headers == ()
    assert details == {}


def test_results_and_tracking_downloads_have_matching_detail_content(
    repository: FakeRepository, monkeypatch: pytest.MonkeyPatch
) -> None:
    repository.add(_detail_record(commentary="Known"))
    run = _detail_run()
    monkeypatch.setattr(api_services, "_runs_for_date", lambda _: [run])
    monkeypatch.setattr(
        "apps.runs.persistence.load_run",
        lambda run_id: run if run_id == "run-details" else None,
    )

    tracking = APIClient().get(
        f"/api/exception-tracking/export/?as_of_date={TRACKING_DATE.isoformat()}"
    )
    results = APIClient().get("/api/exception-tracking/export/?run_id=run-details")

    assert tracking.status_code == results.status_code == 200
    tracking_sheet = load_workbook(io.BytesIO(tracking.content))["Exceptions"]
    results_sheet = load_workbook(io.BytesIO(results.content))["Exceptions"]
    tracking_rows = [[cell.value for cell in row] for row in tracking_sheet.iter_rows()]
    results_rows = [[cell.value for cell in row] for row in results_sheet.iter_rows()]
    assert tracking_rows == results_rows


def test_import_ignores_edited_and_cleared_detail_values(
    repository: FakeRepository, monkeypatch: pytest.MonkeyPatch
) -> None:
    repository.add(_detail_record(commentary="Before"))
    monkeypatch.setattr(api_services, "_runs_for_date", lambda _: [_detail_run()])
    export = APIClient().get(
        f"/api/exception-tracking/export/?as_of_date={TRACKING_DATE.isoformat()}"
    )
    workbook = load_workbook(io.BytesIO(export.content))
    sheet = workbook["Exceptions"]
    sheet["E2"] = "After"
    sheet["J2"] = "Edited detail"
    sheet["K2"] = None
    sheet["L2"] = "=1+1"
    sheet["M2"] = ""
    buffer = io.BytesIO()
    workbook.save(buffer)

    response = APIClient().post(
        "/api/exception-tracking/import/",
        {"file": _upload(buffer.getvalue()), "as_of_date": TRACKING_DATE.isoformat()},
        format="multipart",
    )

    assert response.status_code == 200
    assert response.json()["updated"] == 1
    assert repository.tables[TRACKING_DATE][0]["exception_commentary"] == "After"


def test_import_accepts_workbook_with_informational_columns_deleted(
    repository: FakeRepository, monkeypatch: pytest.MonkeyPatch
) -> None:
    repository.add(_detail_record(commentary="Before"))
    monkeypatch.setattr(api_services, "_runs_for_date", lambda _: [_detail_run()])
    export = APIClient().get(
        f"/api/exception-tracking/export/?as_of_date={TRACKING_DATE.isoformat()}"
    )
    workbook = load_workbook(io.BytesIO(export.content))
    sheet = workbook["Exceptions"]
    sheet["E2"] = "After"
    for _ in range(sheet.max_column - len(EXCEPTION_HEADERS)):
        sheet.delete_cols(len(EXCEPTION_HEADERS) + 1)
    buffer = io.BytesIO()
    workbook.save(buffer)

    response = APIClient().post(
        "/api/exception-tracking/import/",
        {"file": _upload(buffer.getvalue())},
        format="multipart",
    )

    assert response.status_code == 200
    assert response.json()["updated"] == 1
    assert repository.tables[TRACKING_DATE][0]["exception_commentary"] == "After"


def test_unknown_id_with_detail_columns_fails_without_partial_update(
    repository: FakeRepository, monkeypatch: pytest.MonkeyPatch
) -> None:
    repository.add(_detail_record(commentary="Original"))
    monkeypatch.setattr(api_services, "_runs_for_date", lambda _: [_detail_run()])
    export = APIClient().get(
        f"/api/exception-tracking/export/?as_of_date={TRACKING_DATE.isoformat()}"
    )
    workbook = load_workbook(io.BytesIO(export.content))
    workbook["Exceptions"]["A2"] = "UNKNOWN_ID"
    workbook["Exceptions"]["E2"] = "Changed"
    workbook["Exceptions"]["M2"] = "Edited detail"
    buffer = io.BytesIO()
    workbook.save(buffer)

    response = APIClient().post(
        "/api/exception-tracking/import/",
        {"file": _upload(buffer.getvalue()), "as_of_date": TRACKING_DATE.isoformat()},
        format="multipart",
    )

    assert response.status_code == 400
    assert response.json()["code"] == "unknown_exception_ids"
    assert repository.update_calls == []
    assert repository.tables[TRACKING_DATE][0]["exception_commentary"] == "Original"


def test_export_without_saved_run_keeps_original_columns_only(
    repository: FakeRepository, monkeypatch: pytest.MonkeyPatch
) -> None:
    repository.add(_detail_record(commentary="Known"))
    monkeypatch.setattr(api_services, "_runs_for_date", lambda _: [])

    response = APIClient().get(
        f"/api/exception-tracking/export/?as_of_date={TRACKING_DATE.isoformat()}"
    )

    assert response.status_code == 200
    sheet = load_workbook(io.BytesIO(response.content))["Exceptions"]
    assert [cell.value for cell in sheet[1]] == list(EXCEPTION_HEADERS)
