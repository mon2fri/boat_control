from __future__ import annotations

import io
from datetime import UTC, date, datetime
from typing import Any

import pytest
from apps.exception_tracking.workbook import (
    EXCEPTION_HEADERS,
    TEMPLATE_VERSION,
    WorkbookValidationError,
    build_commentary_workbook,
    parse_commentary_workbook,
)
from openpyxl import load_workbook


def _record(exception_id: str = "CBR1_RULE_ID_1", commentary: str = "") -> dict[str, str]:
    return {
        "exception_id": exception_id,
        "exception_rule_identifier": "CBR1_RULE",
        "key_columns": '{"id":"ID","region":"EMEA"}',
        "exception_timestamp": "2026-10-30T08:15:00+00:00",
        "exception_commentary": commentary,
        "exception_as_of_date": "2026-10-30",
        "exception_first_seen_as_of_date": "2026-09-30",
        "exception_last_seen_as_of_date": "2026-10-30",
        "status": "Commented" if commentary else "New",
    }


def _workbook_bytes(rows: list[dict[str, str]]) -> bytes:
    return build_commentary_workbook(
        rows,
        date(2026, 10, 30),
        generated_at=datetime(2026, 11, 3, 12, 0, tzinfo=UTC),
    )


def _mutated_workbook(transform: Any) -> bytes:
    workbook = load_workbook(io.BytesIO(_workbook_bytes([_record()])))
    transform(workbook)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def test_builds_metadata_headers_and_prefilled_commentary() -> None:
    content = _workbook_bytes([_record(commentary="Known upstream defect")])
    workbook = load_workbook(io.BytesIO(content))

    assert workbook.sheetnames == ["Template", "Exceptions"]
    template = workbook["Template"]
    assert template["B2"].value == TEMPLATE_VERSION
    assert template["B3"].value == "2026-10-30"
    assert template["B4"].value == "2026-11-03T12:00:00+00:00"

    sheet = workbook["Exceptions"]
    assert [cell.value for cell in sheet[1]] == list(EXCEPTION_HEADERS)
    assert sheet["A2"].value == "CBR1_RULE_ID_1"
    assert sheet["E2"].value == "Known upstream defect"
    assert sheet["I2"].value == "Commented"


def test_formula_like_text_is_written_as_literal_and_round_trips() -> None:
    commentary = "=SUM(A1:A2)"
    content = _workbook_bytes([_record(commentary=commentary)])

    workbook = load_workbook(io.BytesIO(content))
    assert workbook["Exceptions"]["E2"].value == f"'{commentary}"

    parsed = parse_commentary_workbook(content)
    assert parsed.commentaries == {"CBR1_RULE_ID_1": commentary}


def test_literal_leading_apostrophe_before_formula_text_round_trips() -> None:
    commentary = "'=SUM(A1:A2)"
    content = _workbook_bytes([_record(commentary=commentary)])

    parsed = parse_commentary_workbook(content)
    assert parsed.commentaries == {"CBR1_RULE_ID_1": commentary}


def test_header_only_template_round_trips_for_empty_date() -> None:
    content = _workbook_bytes([])
    parsed = parse_commentary_workbook(content)
    assert parsed.as_of_date == date(2026, 10, 30)
    assert parsed.commentaries == {}
    assert parsed.row_count == 0


def test_duplicate_ids_are_reported_for_service_rejection() -> None:
    workbook = load_workbook(io.BytesIO(_workbook_bytes([_record()])))
    sheet = workbook["Exceptions"]
    sheet.append([_record()["exception_id"], "", "", "", "", "", "", "", ""])
    buffer = io.BytesIO()
    workbook.save(buffer)

    parsed = parse_commentary_workbook(buffer.getvalue())
    assert parsed.duplicate_ids == ("CBR1_RULE_ID_1",)


def test_rejects_wrong_template_version() -> None:
    content = _mutated_workbook(lambda workbook: workbook["Template"].__setitem__("B2", "v0"))
    with pytest.raises(WorkbookValidationError) as error:
        parse_commentary_workbook(content)
    assert error.value.code == "invalid_workbook"


def test_rejects_missing_sheet() -> None:
    def remove_sheet(workbook: Any) -> None:
        workbook.remove(workbook["Exceptions"])

    content = _mutated_workbook(remove_sheet)
    with pytest.raises(WorkbookValidationError):
        parse_commentary_workbook(content)


def test_rejects_wrong_headers() -> None:
    content = _mutated_workbook(
        lambda workbook: workbook["Exceptions"].__setitem__("A1", "Wrong ID")
    )
    with pytest.raises(WorkbookValidationError) as error:
        parse_commentary_workbook(content)
    assert error.value.code == "invalid_workbook"


def test_rejects_unexpected_extra_columns() -> None:
    content = _mutated_workbook(
        lambda workbook: workbook["Exceptions"].__setitem__("J1", "Unexpected")
    )
    with pytest.raises(WorkbookValidationError):
        parse_commentary_workbook(content)


def test_accepts_excel_date_cell_for_as_of_date() -> None:
    def set_date_cell(workbook: Any) -> None:
        workbook["Template"]["B3"] = datetime(2026, 10, 30)

    content = _mutated_workbook(set_date_cell)
    parsed = parse_commentary_workbook(content)
    assert parsed.as_of_date == date(2026, 10, 30)


def test_rejects_invalid_as_of_date() -> None:
    def break_date(workbook: Any) -> None:
        workbook["Template"]["B3"] = "30/10/2026"

    content = _mutated_workbook(break_date)
    with pytest.raises(WorkbookValidationError) as error:
        parse_commentary_workbook(content)
    assert error.value.code == "invalid_as_of_date"


def test_rejects_formula_in_commentary_cell() -> None:
    def add_formula(workbook: Any) -> None:
        workbook["Exceptions"]["E2"] = "=SUM(A1:A2)"

    content = _mutated_workbook(add_formula)
    with pytest.raises(WorkbookValidationError) as error:
        parse_commentary_workbook(content)
    assert error.value.code == "invalid_commentary"


def test_rejects_blank_exception_id_with_a_row_number() -> None:
    def blank_id(workbook: Any) -> None:
        workbook["Exceptions"]["A2"] = "  "

    content = _mutated_workbook(blank_id)
    with pytest.raises(WorkbookValidationError) as error:
        parse_commentary_workbook(content)
    assert error.value.details["row"] == 2


def test_rejects_non_xlsx_content_and_oversized_file() -> None:
    with pytest.raises(WorkbookValidationError) as error:
        parse_commentary_workbook(b"not a workbook")
    assert error.value.code == "invalid_workbook"

    with pytest.raises(WorkbookValidationError) as error:
        parse_commentary_workbook(b"123", max_bytes=2)
    assert error.value.code == "file_too_large"


def test_rejects_row_count_over_limit() -> None:
    content = _workbook_bytes([_record("ID1"), _record("ID2"), _record("ID3")])
    with pytest.raises(WorkbookValidationError) as error:
        parse_commentary_workbook(content, max_rows=2)
    assert error.value.code == "file_too_large"


def test_round_trips_long_commentary_within_excel_cell_limit() -> None:
    commentary = "x" * 32_767
    content = _workbook_bytes([_record(commentary=commentary)])
    parsed = parse_commentary_workbook(content)
    assert parsed.commentaries["CBR1_RULE_ID_1"] == commentary
