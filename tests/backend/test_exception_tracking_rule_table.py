"""Round 4 Worker B: first-tab enabled-rule table on commentary templates."""

from __future__ import annotations

import io
from datetime import UTC, date, datetime

from apps.exception_tracking.rule_summary import (
    MISSING_METADATA,
    NO_SNAPSHOTS_MESSAGE,
    RULE_TABLE_HEADERS,
    build_rule_table_rows,
    enabled_rule_summaries,
    merge_rule_snapshots,
    normalize_rule_summaries,
)
from apps.exception_tracking.workbook import (
    STANDARD_EXCEPTION_HEADERS,
    TEMPLATE_VERSION,
    build_commentary_workbook,
    parse_commentary_workbook,
)
from apps.reports.rule_headers import excel_rule_headers
from openpyxl import load_workbook


def _record(exception_id: str = "CBR1_RULE_ID_1") -> dict[str, str]:
    return {
        "exception_id": exception_id,
        "exception_rule_identifier": "CBR1_RULE",
        "key_columns": '{"id":"ID"}',
        "exception_timestamp": "2026-10-30T08:15:00+00:00",
        "exception_commentary": "",
        "exception_as_of_date": "2026-10-30",
        "exception_first_seen_as_of_date": "2026-10-30",
        "exception_last_seen_as_of_date": "2026-10-30",
        "status": "New",
        "rule_index": "R001",
    }


def _grouped_summary() -> dict[str, object]:
    return {
        "condition_clauses": [
            "Condition 1: region equals 'South'",
            "Condition 2: owner does not equal 'Ops'",
        ],
        "expectation_clauses": [
            "Expectation 1: sa_flag equals 'Yes'",
            "Expectation 2: cva_flag equals 'No'",
            "Expectation 3: sa_flag equals 'No'",
            "Expectation 4: cva_flag equals 'Yes'",
        ],
        "condition_groupings": ("Overall: Group 1\nGroup 1: Condition 1 AND Condition 2"),
        "expectation_groupings": (
            "Overall: Group 3\n"
            "Group 1: Expectation 1 AND Expectation 2\n"
            "Group 2: Expectation 3 AND Expectation 4\n"
            "Group 3: Group 1 OR Group 2"
        ),
        "name": "Opposite flags only",
        "description": "d",
        "logic": "logic",
        "condition": "c",
        "condition_grouping": "g",
        "hide_comparison": False,
        "rule_identifier": "CBR1_GROUPED",
    }


def _table_rows(content: bytes) -> list[list[object]]:
    sheet = load_workbook(io.BytesIO(content))["Template"]
    header = next(row for row in range(8, 13) if sheet.cell(row, 1).value == RULE_TABLE_HEADERS[0])
    rows: list[list[object]] = []
    row = header + 1
    while sheet.cell(row, 1).value is not None:
        # openpyxl reads back cells written as "" as None.
        rows.append(
            [
                sheet.cell(row, column).value if sheet.cell(row, column).value is not None else ""
                for column in range(1, 7)
            ]
        )
        row += 1
    return rows


def test_headers_match_contract_and_sheet_names_preserved() -> None:
    assert RULE_TABLE_HEADERS == (
        "Rule Index/Name",
        "Conditions",
        "Condition Groupings",
        "Expectations",
        "Expectation Groupings",
        "Rule Identifier",
        "Description",
    )
    content = build_commentary_workbook([_record()], date(2026, 10, 30))
    workbook = load_workbook(io.BytesIO(content))
    assert workbook.sheetnames == ["Template", "Exceptions"]
    template = workbook["Template"]
    assert template["A1"].value == "Exception Commentary Template"
    assert template["B2"].value == TEMPLATE_VERSION
    assert template["B3"].value == "2026-10-30"
    assert all(template.cell(7, column).value is None for column in range(1, 8))
    assert template.cell(8, 1).value == "Enabled Rules"
    assert [template.cell(9, column).value for column in range(1, 8)] == list(RULE_TABLE_HEADERS)
    sheet = workbook["Exceptions"]
    assert [cell.value for cell in sheet[1]] == list(STANDARD_EXCEPTION_HEADERS)


def test_grouped_rule_cells_match_excel_report_semantics() -> None:
    summaries = {"R001": _grouped_summary()}
    content = build_commentary_workbook([_record()], date(2026, 10, 30), rule_summaries=summaries)
    rows = _table_rows(content)
    assert len(rows) == 1
    conditions, condition_groups, expectations, expectation_groups = excel_rule_headers(
        summaries["R001"]
    )
    assert rows[0] == [
        "R001 - Opposite flags only",
        conditions,
        condition_groups,
        expectations,
        expectation_groups,
        "CBR1_GROUPED",
    ]
    assert rows[0][1].splitlines() == [
        "Condition 1: region equals 'South'",
        "Condition 2: owner does not equal 'Ops'",
    ]
    assert "Group 3: Group 1 OR Group 2" in rows[0][4]
    assert len(rows[0][3].splitlines()) == 4


def test_persisted_run_summaries_render_verbatim() -> None:
    from apps.rules.services import rule_definition_payload, rule_from_payload
    from apps.runs.services import validate_rows

    from tests.backend.test_report_export_compound_values import (
        _flags_frame,
        _grouped_rule,
    )

    payload = rule_definition_payload(_grouped_rule())
    payload["conditions"] = [
        {"column_name": "region", "operator": "eq", "filter_value": "South"},
        {"column_name": "owner", "operator": "neq", "filter_value": "Ops"},
    ]
    payload["condition_relation"] = "and"
    rule = rule_from_payload("R002", payload)
    validation = validate_rows(_flags_frame(), [rule], ["sa_flag", "cva_flag"], ["id"])
    summaries = validation.rule_summaries
    # Conditions reference absent columns, so this enabled rule has no
    # violations yet its snapshot must still appear.
    assert validation.violations_by_rule["R002"] == []
    content = build_commentary_workbook([], date(2026, 10, 30), rule_summaries=summaries)
    rows = _table_rows(content)
    assert len(rows) == 1
    expected = excel_rule_headers(summaries["R002"])
    assert rows[0][0] == "R002 - Opposite flags only"
    assert rows[0][1] == expected[0]
    assert rows[0][2] == expected[1]
    assert rows[0][3] == expected[2]
    assert rows[0][4] == expected[3]


def test_ungrouped_single_condition_keeps_empty_groupings() -> None:
    summaries = {
        "R001": {
            "condition_clauses": ["Condition 1: status equals 'active'"],
            "expectation_clauses": ["Expectation 1: result equals 'ok'"],
            "condition_groupings": "",
            "expectation_groupings": "",
            "name": "Simple",
            "rule_identifier": "CBR1_SIMPLE",
        }
    }
    rows = _table_rows(build_commentary_workbook([], date(2026, 10, 30), rule_summaries=summaries))
    assert rows == [
        [
            "R001 - Simple",
            "Condition 1: status equals 'active'",
            "",
            "Expectation 1: result equals 'ok'",
            "",
            "CBR1_SIMPLE",
        ]
    ]


def test_numeric_rule_ordering_r2_before_r10() -> None:
    summaries = {
        rule_id: {"name": rule_id, "rule_identifier": f"ID_{rule_id}"}
        for rule_id in ("R100", "R10", "R2")
    }
    rows = _table_rows(build_commentary_workbook([], date(2026, 10, 30), rule_summaries=summaries))
    assert [row[0] for row in rows] == ["R2", "R10", "R100"]


def test_zero_exception_enabled_rule_appears_and_disabled_omitted() -> None:
    summaries = {
        "R001": {"name": "Has exceptions", "rule_identifier": "ID_1"},
        "R002": {"name": "Quiet", "rule_identifier": "ID_2"},
        "R003": {"name": "Off", "rule_identifier": "ID_3", "enabled": False},
        "R004": {"name": "Old", "rule_identifier": "ID_4", "disabled": True},
    }
    rows = _table_rows(build_commentary_workbook([], date(2026, 10, 30), rule_summaries=summaries))
    assert [row[0] for row in rows] == ["R001 - Has exceptions", "R002 - Quiet"]
    assert enabled_rule_summaries(summaries).keys() == {"R001", "R002"}


def test_absent_legacy_metadata_is_explicit() -> None:
    content = build_commentary_workbook([_record()], date(2026, 10, 30))
    rows = _table_rows(content)
    assert rows == [[NO_SNAPSHOTS_MESSAGE, *(MISSING_METADATA,) * 5]]

    rows = _table_rows(
        build_commentary_workbook([], date(2026, 10, 30), rule_summaries={"R007": {}})
    )
    assert rows == [["R007", *(MISSING_METADATA,) * 5]]

    rows = build_rule_table_rows({"R007": {"name": "Known"}})
    assert rows[0][0] == "R007 - Known"
    assert rows[0][5] == MISSING_METADATA


def test_hostile_text_is_stored_literally() -> None:
    summaries = {
        "R001": {
            "condition_clauses": ['=HYPERLINK("http://x","click")'],
            "expectation_clauses": ["-5+3 pricing"],
            "condition_groupings": "@mention group",
            "expectation_groupings": "+plus group",
            "name": "=cmd|' /c calc'!A1",
            "rule_identifier": "=2+2",
        }
    }
    content = build_commentary_workbook([_record()], date(2026, 10, 30), rule_summaries=summaries)
    template = load_workbook(io.BytesIO(content))["Template"]
    values = _table_rows(content)[0]
    # The display name is safe as-is (it does not start with a trigger), while
    # every cell whose text starts with a formula prefix is literal-protected.
    assert values[0] == "R001 - =cmd|' /c calc'!A1"
    assert values[1] == '\'=HYPERLINK("http://x","click")'
    assert values[2] == "'@mention group"
    assert values[3] == "'-5+3 pricing"
    assert values[4] == "'+plus group"
    assert values[5] == "'=2+2"
    for column in range(1, 7):
        assert template.cell(9, column).data_type != "f"


def test_table_cells_wrap_and_have_useful_dimensions() -> None:
    summaries = {"R001": _grouped_summary(), "R002": {"name": "Plain"}}
    template = load_workbook(
        io.BytesIO(build_commentary_workbook([], date(2026, 10, 30), rule_summaries=summaries))
    )["Template"]
    assert template.column_dimensions["C"].width >= 20
    assert template.column_dimensions["D"].width >= 20
    assert template.column_dimensions["E"].width >= 20
    assert template.column_dimensions["F"].width >= 20
    for row in (9, 10, 11):
        for column in range(1, 7):
            assert template.cell(row, column).alignment.wrap_text is True
        assert template.row_dimensions[row].height >= 30
    # Multi-line rule needs a taller row than a single-line rule.
    assert template.row_dimensions[10].height > template.row_dimensions[11].height


def test_generated_workbook_upload_round_trip_with_table() -> None:
    summaries = {"R001": _grouped_summary()}
    content = build_commentary_workbook(
        [_record("ID_1"), _record("ID_2")],
        date(2026, 10, 30),
        generated_at=datetime(2026, 11, 3, 12, 0, tzinfo=UTC),
        rule_summaries=summaries,
        rule_snapshot_notes=["R001: kept runA snapshot."],
    )
    parsed = parse_commentary_workbook(content)
    assert parsed.as_of_date == date(2026, 10, 30)
    assert parsed.template_version == TEMPLATE_VERSION
    assert parsed.row_count == 2
    assert parsed.commentaries == {"ID_1": "", "ID_2": ""}
    template = load_workbook(io.BytesIO(content))["Template"]
    assert template["B2"].value == TEMPLATE_VERSION
    assert template["B3"].value == "2026-10-30"
    assert template.cell(9, 1).value == "Snapshot Notes"
    assert "runA" in str(template.cell(9, 2).value)
    assert _table_rows(content)[0][0] == "R001 - Opposite flags only"


def test_merge_rule_snapshots_union_policy() -> None:
    run_a = {
        "R001": {**_grouped_summary()},
        "R002": {"name": "Quiet", "rule_identifier": "ID_2"},
    }
    changed = {**_grouped_summary(), "rule_identifier": "CBR1_GROUPED_V2"}
    run_b = {"R001": changed, "R003": {"name": "New", "rule_identifier": "ID_3"}}
    merged, notes = merge_rule_snapshots([("runA", run_a), ("runB", run_b)])
    assert set(merged) == {"R001", "R002", "R003"}
    assert merged["R001"]["rule_identifier"] == "CBR1_GROUPED"
    assert len(notes) == 1
    assert "R001" in notes[0] and "runA" in notes[0] and "runB" in notes[0]
    assert "CBR1_GROUPED_V2" in notes[0]

    merged, notes = merge_rule_snapshots([("runA", run_a), ("runB", dict(run_a))])
    assert notes == []

    merged, _ = merge_rule_snapshots([("runA", run_a)], known_rule_ids=["R009", "R001"])
    assert merged["R009"] == {}
    assert normalize_rule_summaries(None) == {}
