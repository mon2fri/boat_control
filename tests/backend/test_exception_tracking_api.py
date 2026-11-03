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
AUGUST_DATE = date(2026, 8, 31)


def _record(
    exception_id: str,
    as_of_date: date,
    *,
    commentary: str = "",
    first_seen: date | None = None,
    status: str | None = None,
    rule_index: str = "R001",
    detail_values: dict[str, str] | None = None,
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
        "rule_index": rule_index,
        "exception_rule_index": rule_index,
        "detail_values": dict(detail_values or {}),
        "exception_extra_values": dict(detail_values or {}),
    }


class FakeRepository:
    """Small contract fixture; production storage is Worker A's repository."""

    def __init__(self) -> None:
        self.tables: dict[date, list[dict[str, Any]]] = {}
        self.update_calls: list[tuple[date, dict[str, str]]] = []
        self.detail_columns: list[str] = []
        self.extra_columns_by_date: dict[date, list[str]] = {}
        self.fail_update = False

    def add(self, record: dict[str, Any]) -> None:
        self.tables.setdefault(record["exception_as_of_date"], []).append(record)

    def list_as_of_dates(self) -> list[date]:
        return sorted(self.tables)

    def list_exceptions(self, as_of_date: date) -> list[dict[str, Any]]:
        return [dict(record) for record in self.tables.get(as_of_date, [])]

    def get_extra_column_union(self) -> list[str]:
        return list(self.detail_columns)

    def get_extra_columns(self, as_of_date: date | None = None) -> list[str]:
        if as_of_date in self.extra_columns_by_date:
            return list(self.extra_columns_by_date[as_of_date])
        return list(self.detail_columns)

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
    assert workbook["Exceptions"]["C2"].value == "Known upstream defect"


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
    exception_id: str = DETAIL_EXCEPTION_ID,
    commentary: str = "",
    *,
    status: str | None = None,
    detail_values: dict[str, str] | None = None,
) -> dict[str, Any]:
    record = _record(
        exception_id,
        TRACKING_DATE,
        commentary=commentary,
        status=status,
        rule_index="R001",
        detail_values=detail_values or {"Region": "EMEA", "score": "10"},
    )
    record["key_columns"] = '{"id":"ID","name":"Alice"}'
    return record


def _with_details(repository: FakeRepository) -> FakeRepository:
    repository.detail_columns = ["score", "Region"]
    return repository


def test_export_appends_only_selected_detail_columns_in_order(
    repository: FakeRepository,
) -> None:
    _with_details(repository)
    repository.add(_detail_record(commentary="Known"))

    response = APIClient().get(
        f"/api/exception-tracking/export/?as_of_date={TRACKING_DATE.isoformat()}"
    )

    assert response.status_code == 200
    sheet = load_workbook(io.BytesIO(response.content))["Exceptions"]
    headers = [cell.value for cell in sheet[1]]
    assert headers == [*EXCEPTION_HEADERS, "score", "Region"]
    assert [cell.value for cell in sheet[2]][:10] == [
        DETAIL_EXCEPTION_ID,
        "Commented",
        "Known",
        "R001",
        "CBR1_RULE",
        '{"id":"ID","name":"Alice"}',
        "2026-10-30T08:15:00+00:00",
        "2026-10-30",
        "2026-10-30",
        "2026-10-30",
    ]
    assert [cell.value for cell in sheet[2]][10:] == ["10", "EMEA"]


def test_export_includes_all_rows_uncommented_first_and_prefilled(
    repository: FakeRepository,
) -> None:
    _with_details(repository)
    repository.add(_detail_record("C_COMMENTED", "already done", status="Commented"))
    repository.add(_detail_record("A_NEW", status="New"))
    repository.add(_detail_record("B_UNCOMMENTED", status="NotCommented"))

    response = APIClient().get(
        f"/api/exception-tracking/export/?as_of_date={TRACKING_DATE.isoformat()}"
    )

    sheet = load_workbook(io.BytesIO(response.content))["Exceptions"]
    assert [sheet.cell(row, 1).value for row in range(2, 5)] == [
        "A_NEW",
        "B_UNCOMMENTED",
        "C_COMMENTED",
    ]
    assert sheet.cell(4, 3).value == "already done"


def test_results_and_tracking_downloads_are_identical(
    repository: FakeRepository, monkeypatch: pytest.MonkeyPatch
) -> None:
    _with_details(repository)
    repository.add(_detail_record(commentary="Known"))
    run = {
        "run_id": "run-details",
        "as_of_date": TRACKING_DATE.isoformat(),
        "result": {},
    }
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


def test_export_with_empty_selection_has_only_standard_columns(
    repository: FakeRepository,
) -> None:
    repository.detail_columns = []
    repository.add(_detail_record(commentary="Known"))

    response = APIClient().get(
        f"/api/exception-tracking/export/?as_of_date={TRACKING_DATE.isoformat()}"
    )

    assert response.status_code == 200
    sheet = load_workbook(io.BytesIO(response.content))["Exceptions"]
    assert [cell.value for cell in sheet[1]] == list(EXCEPTION_HEADERS)


def test_date_scoped_columns_control_tracking_metadata_and_both_export_routes(
    repository: FakeRepository, monkeypatch: pytest.MonkeyPatch
) -> None:
    repository.extra_columns_by_date = {
        AUGUST_DATE: ["REGION", "SEGMENT"],
        PRIOR_DATE: ["SEGMENT", "PORTFOLIO"],
    }
    repository.detail_columns = ["ALL_TIME_UNION_ONLY"]
    repository.add(
        _record(
            "AUG",
            AUGUST_DATE,
            detail_values={"REGION": "APAC", "SEGMENT": "Retail"},
        )
    )
    repository.add(
        _record(
            "SEP",
            PRIOR_DATE,
            detail_values={"SEGMENT": "Wholesale", "PORTFOLIO": "Growth"},
        )
    )
    monkeypatch.setattr(
        "apps.runs.persistence.load_run",
        lambda run_id: {"run_id": run_id, "as_of_date": PRIOR_DATE.isoformat()},
    )

    september_list = APIClient().get(
        f"/api/exception-tracking/?as_of_date={PRIOR_DATE.isoformat()}"
    ).json()
    assert september_list["detail_columns"] == ["SEGMENT", "PORTFOLIO"]
    september_detail_keys = [
        column["key"]
        for column in september_list["columns"]
        if column["source"] == "detail"
    ]
    assert september_detail_keys == ["detail:SEGMENT", "detail:PORTFOLIO"]

    august_list = APIClient().get(
        f"/api/exception-tracking/?as_of_date={AUGUST_DATE.isoformat()}"
    ).json()
    assert august_list["detail_columns"] == ["REGION", "SEGMENT", "PORTFOLIO"]
    assert august_list["exceptions"][0]["detail_values"] == {
        "REGION": "APAC",
        "SEGMENT": "Retail",
        "PORTFOLIO": "",
    }

    august_export = APIClient().get(
        f"/api/exception-tracking/export/?as_of_date={AUGUST_DATE.isoformat()}"
    )
    september_export = APIClient().get(
        f"/api/exception-tracking/export/?as_of_date={PRIOR_DATE.isoformat()}"
    )
    run_export = APIClient().get("/api/exception-tracking/export/?run_id=september-run")

    assert (
        august_export.status_code
        == september_export.status_code
        == run_export.status_code
        == 200
    )
    august_sheet = load_workbook(io.BytesIO(august_export.content))["Exceptions"]
    assert [cell.value for cell in august_sheet[1]][len(EXCEPTION_HEADERS) :] == [
        "REGION",
        "SEGMENT",
        "PORTFOLIO",
    ]
    assert [cell.value for cell in august_sheet[2]][len(EXCEPTION_HEADERS) :] == [
        "APAC",
        "Retail",
        None,
    ]

    september_sheet = load_workbook(io.BytesIO(september_export.content))["Exceptions"]
    run_sheet = load_workbook(io.BytesIO(run_export.content))["Exceptions"]
    expected_headers = [*EXCEPTION_HEADERS, "SEGMENT", "PORTFOLIO"]
    assert [cell.value for cell in september_sheet[1]] == expected_headers
    assert [cell.value for cell in run_sheet[1]] == expected_headers
    assert [cell.value for cell in september_sheet[2]][len(EXCEPTION_HEADERS) :] == [
        "Wholesale",
        "Growth",
    ]
    assert [cell.value for cell in run_sheet[2]] == [
        cell.value for cell in september_sheet[2]
    ]


def test_latest_explicit_empty_selection_does_not_add_earlier_columns(
    repository: FakeRepository,
) -> None:
    repository.extra_columns_by_date = {
        AUGUST_DATE: ["REGION", "SEGMENT"],
        PRIOR_DATE: [],
    }
    repository.add(_record("AUG", AUGUST_DATE, detail_values={"REGION": "APAC"}))
    repository.add(_record("SEP", PRIOR_DATE, detail_values={}))

    response = APIClient().get(
        f"/api/exception-tracking/export/?as_of_date={PRIOR_DATE.isoformat()}"
    )

    assert response.status_code == 200
    sheet = load_workbook(io.BytesIO(response.content))["Exceptions"]
    assert [cell.value for cell in sheet[1]] == list(EXCEPTION_HEADERS)


def test_legacy_repository_union_remains_a_compatibility_fallback() -> None:
    class LegacyRepository:
        def get_extra_column_union(self) -> list[str]:
            return ["Legacy Region", "Legacy Segment"]

    assert api_services.list_template_detail_columns(
        LegacyRepository(), PRIOR_DATE
    ) == ["Legacy Region", "Legacy Segment"]


def test_import_ignores_edited_and_cleared_detail_values(
    repository: FakeRepository,
) -> None:
    _with_details(repository)
    repository.add(_detail_record(commentary="Before"))
    export = APIClient().get(
        f"/api/exception-tracking/export/?as_of_date={TRACKING_DATE.isoformat()}"
    )
    workbook = load_workbook(io.BytesIO(export.content))
    sheet = workbook["Exceptions"]
    sheet["C2"] = "After"
    sheet["K2"] = "Edited detail"
    sheet["L2"] = "=1+1"
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
    assert repository.tables[TRACKING_DATE][0]["detail_values"]["score"] == "10"


def test_import_accepts_workbook_with_hidden_and_detail_columns_deleted(
    repository: FakeRepository,
) -> None:
    _with_details(repository)
    repository.add(_detail_record(commentary="Before"))
    export = APIClient().get(
        f"/api/exception-tracking/export/?as_of_date={TRACKING_DATE.isoformat()}"
    )
    workbook = load_workbook(io.BytesIO(export.content))
    sheet = workbook["Exceptions"]
    sheet["C2"] = "After"
    for _ in range(sheet.max_column - 4):
        sheet.delete_cols(5)
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
    repository: FakeRepository,
) -> None:
    _with_details(repository)
    repository.add(_detail_record(commentary="Original"))
    export = APIClient().get(
        f"/api/exception-tracking/export/?as_of_date={TRACKING_DATE.isoformat()}"
    )
    workbook = load_workbook(io.BytesIO(export.content))
    workbook["Exceptions"]["A2"] = "UNKNOWN_ID"
    workbook["Exceptions"]["C2"] = "Changed"
    workbook["Exceptions"]["K2"] = "Edited detail"
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


def test_tracking_table_metadata_default_page_and_all_operations(
    repository: FakeRepository,
) -> None:
    _with_details(repository)
    for index in range(65):
        repository.add(
            _detail_record(
                f"ID_{index:03d}",
                status="New" if index < 60 else "Commented",
                detail_values={
                    "Region": "EMEA" if index % 2 == 0 else "APAC",
                    "score": str(index),
                },
            )
        )

    response = APIClient().get(
        f"/api/exception-tracking/?as_of_date={TRACKING_DATE.isoformat()}"
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 65
    assert payload["unfiltered_total"] == 65
    assert payload["offset"] == 0
    assert payload["limit"] == 50
    assert payload["has_more"] is True
    assert len(payload["exceptions"]) == 50
    assert [column["visible"] for column in payload["columns"][:4]] == [True] * 4
    assert all(column["visible"] is False for column in payload["columns"][4:])
    detail_keys = [column["key"] for column in payload["columns"] if column["source"] == "detail"]
    assert detail_keys == ["detail:score", "detail:Region"]
    assert payload["available_filters"]["status"] == ["Commented", "New"]
    assert payload["available_filters"]["detail:Region"] == ["APAC", "EMEA"]


def test_tracking_table_filters_before_paging_and_sorts_globally(
    repository: FakeRepository,
) -> None:
    _with_details(repository)
    for index in range(60):
        repository.add(
            _detail_record(
                f"ID_{index:03d}",
                status="New",
                detail_values={"Region": "EMEA", "score": str(index)},
            )
        )
    for index in range(5):
        repository.add(
            _detail_record(
                f"Z_{index:03d}",
                status="Commented",
                detail_values={"Region": "APAC", "score": str(index)},
            )
        )

    filtered = APIClient().get(
        f"/api/exception-tracking/?as_of_date={TRACKING_DATE.isoformat()}"
        "&filter_status=New&filter_detail:Region=EMEA&limit=50"
    )

    assert filtered.status_code == 200
    payload = filtered.json()
    assert payload["total"] == 60
    assert payload["unfiltered_total"] == 65
    assert len(payload["exceptions"]) == 50
    assert payload["has_more"] is True
    assert {item["status"] for item in payload["exceptions"]} == {"New"}

    sorted_page = APIClient().get(
        f"/api/exception-tracking/?as_of_date={TRACKING_DATE.isoformat()}"
        "&sort=exception_id&order=desc&limit=100"
    )
    ids = [item["exception_id"] for item in sorted_page.json()["exceptions"]]
    assert ids[:2] == ["Z_004", "Z_003"]

    detail_sorted = APIClient().get(
        f"/api/exception-tracking/?as_of_date={TRACKING_DATE.isoformat()}"
        "&sort=detail:score&order=asc&limit=100"
    )
    assert detail_sorted.status_code == 200
    assert len(detail_sorted.json()["exceptions"]) == 65


def test_tracking_table_rejects_invalid_paging_sort_and_filter(
    repository: FakeRepository,
) -> None:
    _with_details(repository)
    repository.add(_detail_record())

    invalid_limit = APIClient().get(
        f"/api/exception-tracking/?as_of_date={TRACKING_DATE.isoformat()}&limit=60"
    )
    assert invalid_limit.status_code == 400
    assert invalid_limit.json()["code"] == "invalid_page_size"

    invalid_sort = APIClient().get(
        f"/api/exception-tracking/?as_of_date={TRACKING_DATE.isoformat()}&sort=nope"
    )
    assert invalid_sort.status_code == 400
    assert invalid_sort.json()["code"] == "invalid_sort"

    invalid_filter = APIClient().get(
        f"/api/exception-tracking/?as_of_date={TRACKING_DATE.isoformat()}&filter_nope=x"
    )
    assert invalid_filter.status_code == 400
    assert invalid_filter.json()["code"] == "invalid_filter"
