from __future__ import annotations

import io
from datetime import UTC, date, datetime
from typing import Any

import pytest
from apps.exception_tracking.workbook import (
    EXCEPTION_HEADERS,
    LEGACY_EXCEPTION_HEADERS,
    LEGACY_TEMPLATE_VERSION,
    RECERT_HEADERS,
    STANDARD_EXCEPTION_HEADERS,
    TEMPLATE_VERSION,
    VISIBLE_COLUMN_COUNT,
    WorkbookValidationError,
    build_commentary_workbook,
    parse_commentary_workbook,
)
from openpyxl import Workbook, load_workbook


def _record(
    exception_id: str = "CBR1_RULE_ID_1",
    commentary: str = "",
    status: str | None = None,
    rule_index: str = "R001",
) -> dict[str, str]:
    return {
        "exception_id": exception_id,
        "exception_rule_identifier": "CBR1_RULE",
        "key_columns": '{"id":"ID","region":"EMEA"}',
        "exception_timestamp": "2026-10-30T08:15:00+00:00",
        "exception_commentary": commentary,
        "exception_as_of_date": "2026-10-30",
        "exception_first_seen_as_of_date": "2026-09-30",
        "exception_last_seen_as_of_date": "2026-10-30",
        "status": status or ("Commented" if commentary else "New"),
        "rule_index": rule_index,
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


def _legacy_workbook(commentary: str = "legacy") -> bytes:
    workbook = Workbook()
    template = workbook.active
    template.title = "Template"
    template["B2"] = LEGACY_TEMPLATE_VERSION
    template["B3"] = "2026-10-30"
    sheet = workbook.create_sheet("Exceptions")
    sheet.append(list(LEGACY_EXCEPTION_HEADERS))
    sheet.append(
        [
            "CBR1_RULE_ID_1",
            "CBR1_RULE",
            '{"id":"ID"}',
            "2026-10-30T08:15:00+00:00",
            commentary,
            "2026-10-30",
            "2026-09-30",
            "2026-10-30",
            "Commented",
        ]
    )
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def test_builds_optimized_metadata_headers_visibility_and_commentary() -> None:
    content = _workbook_bytes([_record(commentary="Known upstream defect")])
    workbook = load_workbook(io.BytesIO(content))

    assert workbook.sheetnames == ["Template", "Exceptions"]
    template = workbook["Template"]
    assert template["B2"].value == TEMPLATE_VERSION
    assert template["B3"].value == "2026-10-30"
    assert template["B4"].value == "2026-11-03T12:00:00+00:00"

    sheet = workbook["Exceptions"]
    assert [cell.value for cell in sheet[1]] == list(STANDARD_EXCEPTION_HEADERS)
    assert sheet["A2"].value == "CBR1_RULE_ID_1"
    assert sheet["B2"].value == "Commented"
    assert sheet["C2"].value == "Known upstream defect"
    assert sheet["D2"].value == "R001"
    for index in range(1, len(STANDARD_EXCEPTION_HEADERS) + 1):
        column = sheet.cell(1, index).column_letter
        expected_hidden = VISIBLE_COLUMN_COUNT < index <= len(EXCEPTION_HEADERS)
        assert bool(sheet.column_dimensions[column].hidden) is expected_hidden


def test_orders_new_then_not_commented_then_commented_with_stable_ids() -> None:
    content = _workbook_bytes(
        [
            _record("C_ID", "done", status="Commented"),
            _record("A_ID", status="New"),
            _record("B_ID", status="NotCommented"),
            _record("D_ID", status="New"),
        ]
    )
    sheet = load_workbook(io.BytesIO(content))["Exceptions"]
    assert [sheet.cell(row, 1).value for row in range(2, 6)] == [
        "A_ID",
        "B_ID",
        "D_ID",
        "C_ID",
    ]


def test_formula_like_text_is_written_as_literal_and_round_trips() -> None:
    commentary = "=SUM(A1:A2)"
    content = _workbook_bytes([_record(commentary=commentary)])

    workbook = load_workbook(io.BytesIO(content))
    assert workbook["Exceptions"]["C2"].value == f"'{commentary}"

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
    assert parsed.template_version == TEMPLATE_VERSION


def test_legacy_v1_workbook_still_imports() -> None:
    parsed = parse_commentary_workbook(_legacy_workbook("legacy commentary"))
    assert parsed.template_version == LEGACY_TEMPLATE_VERSION
    assert parsed.commentaries == {"CBR1_RULE_ID_1": "legacy commentary"}


def test_duplicate_ids_are_reported_for_service_rejection() -> None:
    workbook = load_workbook(io.BytesIO(_workbook_bytes([_record()])))
    sheet = workbook["Exceptions"]
    sheet.append([_record()["exception_id"], "", "", ""])
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


def test_rejects_wrong_first_four_headers() -> None:
    content = _mutated_workbook(
        lambda workbook: workbook["Exceptions"].__setitem__("C1", "Wrong Commentary")
    )
    with pytest.raises(WorkbookValidationError) as error:
        parse_commentary_workbook(content)
    assert error.value.code == "invalid_workbook"


def test_trailing_standard_metadata_and_data_columns_are_informational() -> None:
    def change_informational(workbook: Any) -> None:
        workbook["Exceptions"]["E2"] = "Changed rule identifier"
        workbook["Exceptions"]["J2"] = None
        # First user detail column now follows the provenance block.
        workbook["Exceptions"]["Q1"] = "Region"
        workbook["Exceptions"]["Q2"] = "EMEA"
        # Provenance cells are informational: edits here never change the import.
        workbook["Exceptions"]["K2"] = "tampered reason"

    content = _mutated_workbook(change_informational)
    parsed = parse_commentary_workbook(content)

    assert parsed.as_of_date == date(2026, 10, 30)
    assert parsed.commentaries == {"CBR1_RULE_ID_1": ""}
    assert parsed.row_count == 1


def test_appends_only_selected_detail_columns_in_order() -> None:
    record = _record(commentary="Reviewed")
    content = build_commentary_workbook(
        [record],
        date(2026, 10, 30),
        detail_columns=["score", "Region", "Rule Index", "Exception ID"],
        detail_values={
            record["exception_id"]: {
                "score": "10",
                "Region": "EMEA",
                "Rule Index": "SHOULD_NOT_DUPLICATE",
            }
        },
    )
    workbook = load_workbook(io.BytesIO(content))
    sheet = workbook["Exceptions"]

    assert [cell.value for cell in sheet[1]] == [
        *STANDARD_EXCEPTION_HEADERS,
        "score",
        "Region",
    ]
    assert [cell.value for cell in sheet[2]][len(STANDARD_EXCEPTION_HEADERS) :] == [
        "10",
        "EMEA",
    ]
    assert sheet.column_dimensions["Q"].hidden is False
    assert sheet.column_dimensions["R"].hidden is False


def test_later_selected_detail_column_is_blank_when_record_has_no_value() -> None:
    record = _record()
    content = build_commentary_workbook(
        [record],
        date(2026, 10, 30),
        detail_columns=["REGION", "SEGMENT", "PORTFOLIO"],
        detail_values={record["exception_id"]: {"REGION": "APAC", "SEGMENT": "Retail"}},
    )

    sheet = load_workbook(io.BytesIO(content))["Exceptions"]
    assert [cell.value for cell in sheet[1]][len(STANDARD_EXCEPTION_HEADERS) :] == [
        "REGION",
        "SEGMENT",
        "PORTFOLIO",
    ]
    assert [cell.value for cell in sheet[2]][len(STANDARD_EXCEPTION_HEADERS) :] == [
        "APAC",
        "Retail",
        None,
    ]


def test_empty_selection_adds_no_data_columns() -> None:
    content = _workbook_bytes([_record()])
    sheet = load_workbook(io.BytesIO(content))["Exceptions"]
    assert [cell.value for cell in sheet[1]] == list(STANDARD_EXCEPTION_HEADERS)


def test_detail_values_are_formula_protected_as_literal_text() -> None:
    record = _record()
    content = build_commentary_workbook(
        [record],
        date(2026, 10, 30),
        detail_columns=["Region"],
        detail_values={record["exception_id"]: {"Region": "=HYPERLINK(\"x\")"}},
    )
    workbook = load_workbook(io.BytesIO(content))
    assert workbook["Exceptions"]["Q2"].value == "'=HYPERLINK(\"x\")"


def test_detail_column_header_is_formula_protected_as_literal_text() -> None:
    record = _record()
    content = build_commentary_workbook(
        [record],
        date(2026, 10, 30),
        detail_columns=["=HYPERLINK(\"x\")"],
        detail_values={record["exception_id"]: {"=HYPERLINK(\"x\")": "value"}},
    )
    workbook = load_workbook(io.BytesIO(content))
    assert workbook["Exceptions"]["Q1"].value == "'=HYPERLINK(\"x\")"


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
        workbook["Exceptions"]["C2"] = "=SUM(A1:A2)"

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


def test_source_status_exports_separately_from_exception_status() -> None:
    record = _record()
    payload = build_commentary_workbook(
        [record], date(2026, 10, 30), detail_columns=["status"],
        detail_values={record["exception_id"]: {"status": "inactive"}},
    )
    sheet = load_workbook(io.BytesIO(payload))["Exceptions"]
    headers = [cell.value for cell in sheet[1]]
    assert sheet.cell(2, headers.index("Exception Status") + 1).value == "New"
    assert sheet.cell(2, headers.index("status") + 1).value == "inactive"
