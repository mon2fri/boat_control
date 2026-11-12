"""Shared exception commentary XLSX workbook used by tracking and results.

Only the workbook format lives here. Identity, history and SQLite storage are
owned by Worker A; API wiring is owned by Worker B.
"""

from __future__ import annotations

import io
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from typing import Any

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

from apps.exception_tracking.dates import parse_iso_date
from apps.exception_tracking.rule_summary import (
    MISSING_METADATA,
    NO_SNAPSHOTS_MESSAGE,
    RULE_TABLE_HEADERS,
    build_rule_table_rows,
)

TEMPLATE_VERSION = "exception_commentary/v2"
LEGACY_TEMPLATE_VERSION = "exception_commentary/v1"
TEMPLATE_SHEET = "Template"
EXCEPTIONS_SHEET = "Exceptions"

VISIBLE_COLUMN_COUNT = 4

LEGACY_EXCEPTION_HEADERS: tuple[str, ...] = (
    "Exception ID",
    "Exception Rule Identifier",
    "Key Columns",
    "Exception Timestamp",
    "Exception Commentary",
    "Exception As-of Date",
    "Exception First Seen As-of Date",
    "Exception Last Seen As-of Date",
    "Status",
)
EXCEPTION_HEADERS: tuple[str, ...] = (
    "Exception ID",
    "Exception Status",
    "Commentary",
    "Rule Index",
    "Exception Rule Identifier",
    "Key Columns",
    "Exception Timestamp",
    "Exception As-of Date",
    "Exception First Seen As-of Date",
    "Exception Last Seen As-of Date",
)
_EXCEPTION_FIELDS: tuple[str, ...] = (
    "exception_id",
    "status",
    "exception_commentary",
    "rule_index",
    "exception_rule_identifier",
    "key_columns",
    "exception_timestamp",
    "exception_as_of_date",
    "exception_first_seen_as_of_date",
    "exception_last_seen_as_of_date",
)

#: Additive recertification/provenance columns from the Round-1 template layout.
#: They are NO LONGER written to downloaded templates (Round-2 removed every
#: visible provenance column), but the names stay reserved so user detail
#: columns cannot recreate them, and old workbooks carrying them still import
#: (their values are ignored during upload; provenance lives in the database).
RECERT_HEADERS: tuple[str, ...] = (
    "Recertification Reason",
    "Carried From Exception ID",
    "Carried From As-of Date",
    "Carried From Rule Identifier",
    "Rule Evolution Event ID",
    "Recertified At",
)
_RECERT_FIELDS: tuple[str, ...] = (
    "recertification_required",
    "carried_from_exception_id",
    "carried_from_as_of_date",
    "carried_from_rule_identifier",
    "rule_evolution_event_id",
    "recertified_at",
)

#: Round-2 review column appended after the standard metadata (and before
#: user detail columns). It defaults to blank; the Excel dropdown offers the
#: only accepted nonblank values. Pending recertification is displayed
#: through Exception Status, never through this column's value.
RECERTIFY_COLUMN = "Commentary Recertify"
RECERTIFY_OPTIONS: tuple[str, ...] = ("Keep Current", "Updated")

# Full standard Exceptions-sheet header row: identity/status metadata followed
# by the review column. Import validation only requires the leading visible
# prefix, so older workbooks without the review column keep importing (their
# rows behave as if the column were left blank).
STANDARD_EXCEPTION_HEADERS: tuple[str, ...] = (*EXCEPTION_HEADERS, RECERTIFY_COLUMN)

MAX_TEMPLATE_BYTES = 10 * 1024 * 1024
MAX_TEMPLATE_ROWS = 100_000
MAX_COMMENTARY_LENGTH = 32_767
MAX_EXCEPTION_ID_LENGTH = 4_096

_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


class WorkbookValidationError(ValueError):
    """A template is malformed or unsafe to import."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "invalid_workbook",
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.details = details or {}


@dataclass(frozen=True)
class ParsedCommentaryTemplate:
    as_of_date: date
    commentaries: dict[str, str]
    row_count: int
    duplicate_ids: tuple[str, ...] = field(default_factory=tuple)
    template_version: str = TEMPLATE_VERSION
    recertifications: dict[str, str] = field(default_factory=dict)
    """Trimmed ``Commentary Recertify`` choice per exception ID.

    Only ``""`` (blank), ``"Keep Current"`` and ``"Updated"`` can appear
    here; anything else fails parsing before any database write. Templates
    without the column (legacy or pre-Round-2 workbooks) yield ``{}`` and
    every row behaves as blank.
    """


def _needs_formula_protection(value: str) -> bool:
    return value.lstrip("'").startswith(_FORMULA_PREFIXES)


def _protect_text(value: str) -> str:
    if _needs_formula_protection(value):
        return f"'{value}"
    return value


def _restore_text(value: Any) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        return str(value)
    if value.startswith("'") and _needs_formula_protection(value[1:]):
        return value[1:]
    return value


def _cell_text(value: Any) -> str:
    return _restore_text(value).strip()


def _record_value(record: Mapping[str, Any], field_name: str) -> str:
    value = record.get(field_name)
    if value is None:
        return ""
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return str(value)


def _style_header(sheet: Any) -> None:
    fill = PatternFill("solid", fgColor="DCE6F1")
    for cell in sheet[1]:
        cell.font = Font(bold=True)
        cell.fill = fill
        cell.alignment = Alignment(vertical="top", wrap_text=True)


def _header_key(value: object) -> str:
    return " ".join(str(value).split()).casefold()


def _unique_detail_columns(columns: Iterable[str]) -> tuple[str, ...]:
    used = {
        _header_key(header)
        for header in (*EXCEPTION_HEADERS, *RECERT_HEADERS, RECERTIFY_COLUMN)
    }
    result: list[str] = []
    for raw in columns:
        name = str(raw).strip()
        if not name:
            continue
        key = _header_key(name)
        if key in used:
            continue
        used.add(key)
        result.append(name)
    return tuple(result)


def _detail_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


_STATUS_RANK = {"New": 0, "NotCommented": 0, "RecertificationRequired": 0, "Commented": 1}


def _write_rule_summary_table(
    sheet: Any,
    rule_summaries: Mapping[str, Any] | None,
    rule_snapshot_notes: Iterable[str] = (),
) -> None:
    """Additive enabled-rule table below the Template metadata block.

    Blank row 7 separates metadata from the title on row 8 and keeps
    parser-critical B2/B3 positions untouched; the
    Exceptions sheet and its import validation are unaffected.
    """
    notes = [str(note) for note in (rule_snapshot_notes or []) if str(note).strip()]
    sheet.cell(8, 1, "Enabled Rules").font = Font(bold=True, size=12)

    row = 9
    if notes:
        sheet.cell(row, 1, "Snapshot Notes").font = Font(bold=True)
        sheet.cell(row, 2, _protect_text("\n".join(notes)))
        row += 1

    header_fill = PatternFill("solid", fgColor="DCE6F1")
    for column, header in enumerate(RULE_TABLE_HEADERS, start=1):
        cell = sheet.cell(row, column, _protect_text(header))
        cell.font = Font(bold=True)
        cell.fill = header_fill
        cell.alignment = Alignment(vertical="top", wrap_text=True)
    sheet.row_dimensions[row].height = 30
    row += 1

    rows = build_rule_table_rows(rule_summaries)
    if not rows:
        rows = [(NO_SNAPSHOTS_MESSAGE, *(MISSING_METADATA,) * (len(RULE_TABLE_HEADERS) - 1))]
    for values in rows:
        if len(values) != len(RULE_TABLE_HEADERS):
            values = tuple(list(values) + [""] * len(RULE_TABLE_HEADERS))[: len(RULE_TABLE_HEADERS)]
        max_lines = 1
        for column, value in enumerate(values, start=1):
            text = "" if value is None else str(value)
            cell = sheet.cell(row, column, _protect_text(text))
            cell.alignment = Alignment(vertical="top", wrap_text=True)
            max_lines = max(max_lines, text.count("\n") + 1)
        sheet.row_dimensions[row].height = max(30, 15 * max_lines)
        row += 1

    sheet.column_dimensions["C"].width = 32
    sheet.column_dimensions["D"].width = 48
    sheet.column_dimensions["E"].width = 32
    sheet.column_dimensions["F"].width = 36
    sheet.column_dimensions["G"].width = 60


def _status_rank(value: object) -> int:
    return _STATUS_RANK.get(str(value), len(_STATUS_RANK))


def build_commentary_workbook(
    records: Iterable[Mapping[str, Any]],
    as_of_date: date,
    *,
    generated_at: datetime | None = None,
    detail_columns: Iterable[str] = (),
    detail_values: Mapping[str, Mapping[str, Any]] | None = None,
    rule_summaries: Mapping[str, Any] | None = None,
    rule_snapshot_notes: Iterable[str] = (),
    report_name: str = "",
) -> bytes:
    """Build the shared EXCEPTION commentary template.

    ``records`` uses the API record shape (the ten persisted columns plus
    ``status``). Text is written literally with formula-injection protection.
    ``detail_columns`` are the ordered `Extra Columns for Commentary Template`
    selection appended after the standard metadata. Their values are keyed by
    exception ID in ``detail_values`` and are never used by import validation.

    ``rule_summaries`` is a keyword-only optional mapping of rule index
    (``"R001"``) to that run's persisted validation summary mapping, exactly
    as stored under ``result["validation"]["rule_summaries"]`` (see
    ``apps.exception_tracking.rule_summary`` for the full contract, the
    date-wide union policy and the missing-metadata representation). It
    renders as a readable enabled-rule table on the Template sheet after the
    metadata/instructions block; enabled rules with zero exceptions appear
    because rows come from these snapshots, never from violations. ``None``
    (for example legacy runs without snapshots) renders an explicit
    placeholder row. ``rule_snapshot_notes`` renders optional snapshot-union
    notes above the table header. Both inputs are additive: the Template
    sheet name, parser metadata positions B2/B3, template version, Exceptions
    columns and commentary rules are unchanged, so existing and new files
    keep importing.
    """
    workbook = Workbook()
    template = workbook.active
    template.title = TEMPLATE_SHEET

    template["A1"] = "Exception Commentary Template"
    template["A1"].font = Font(bold=True, size=14)
    template["A2"] = "Template Version"
    template["B2"] = _protect_text(TEMPLATE_VERSION)
    template["A3"] = "As-of Date"
    template["B3"] = as_of_date.isoformat()
    template["A4"] = "Generated At"
    generated = generated_at or datetime.now(UTC)
    template["B4"] = _protect_text(generated.isoformat())
    template["A5"] = "Instructions"
    template["B5"] = _protect_text(
        "Edit only the Commentary and Commentary Recertify columns. Rows with "
        "Exception Status RecertificationRequired need a Commentary Recertify "
        "choice (Keep Current or Updated) to complete the review; a blank "
        "choice leaves the row pending. Do not change exception IDs. Columns "
        "after Commentary Recertify are informational context and are ignored "
        "during upload."
    )
    template["A6"] = "Report Name"
    template["B6"] = _protect_text(report_name or MISSING_METADATA)
    template.column_dimensions["A"].width = 24
    template.column_dimensions["B"].width = 90
    _write_rule_summary_table(
        template,
        rule_summaries,
        rule_snapshot_notes,
    )

    appended = _unique_detail_columns(detail_columns)
    headers = [*EXCEPTION_HEADERS, RECERTIFY_COLUMN, *appended]
    sheet = workbook.create_sheet(EXCEPTIONS_SHEET)
    sheet.append(
        [
            *EXCEPTION_HEADERS,
            RECERTIFY_COLUMN,
            *[_protect_text(column) for column in appended],
        ]
    )
    _style_header(sheet)

    values_by_id = detail_values or {}
    recertify_column = len(EXCEPTION_HEADERS) + 1
    ordered = sorted(
        records,
        key=lambda item: (
            _status_rank(_record_value(item, "status")),
            _record_value(item, "exception_id"),
        ),
    )
    for record in ordered:
        exception_id = _record_value(record, "exception_id")
        detail = values_by_id.get(exception_id) or {}
        sheet.append(
            [
                *[_protect_text(_record_value(record, field)) for field in _EXCEPTION_FIELDS],
                # The review choice always exports blank; pending review is
                # shown through Exception Status, and provenance stays in the
                # database rather than in visible template columns.
                "",
                *[_protect_text(_detail_text(detail.get(column))) for column in appended],
            ]
        )

    if ordered:
        last_row = len(ordered) + 1
        recertify_letter = get_column_letter(recertify_column)
        dropdown = DataValidation(
            type="list",
            formula1=f'"{",".join(RECERTIFY_OPTIONS)}"',
            allow_blank=True,
        )
        dropdown.error = "Leave blank, or choose Keep Current or Updated."
        dropdown.errorTitle = "Invalid Commentary Recertify value"
        dropdown.prompt = (
            "Keep Current keeps the stored commentary; "
            "Updated applies the Commentary cell."
        )
        dropdown.promptTitle = "Commentary Recertify"
        sheet.add_data_validation(dropdown)
        dropdown.add(f"{recertify_letter}2:{recertify_letter}{last_row}")

    widths = (
        52, 18, 52, 16, 34, 42, 26, 22, 28, 28,
        20,
        *([24] * len(appended)),
    )
    for index, width in enumerate(widths, start=1):
        column = get_column_letter(index)
        sheet.column_dimensions[column].width = width
        if VISIBLE_COLUMN_COUNT < index <= len(EXCEPTION_HEADERS):
            sheet.column_dimensions[column].hidden = True
    for row in sheet.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = Alignment(vertical="top", wrap_text=True)
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = f"A1:{get_column_letter(len(headers))}{max(sheet.max_row, 1)}"

    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _validated_headers(row: tuple[Any, ...], version: str) -> tuple[int, int, int | None]:
    headers = tuple(_cell_text(cell.value) for cell in row)
    if version == LEGACY_TEMPLATE_VERSION:
        expected = LEGACY_EXCEPTION_HEADERS
        commentary_index = expected.index("Exception Commentary")
    else:
        expected = EXCEPTION_HEADERS[:VISIBLE_COLUMN_COUNT]
        commentary_index = expected.index("Commentary")
    required_count = len(expected)
    if len(headers) < required_count or headers[:required_count] != expected:
        raise WorkbookValidationError(
            f"The Exceptions sheet's required {version} columns are missing or out of order.",
            details={"expected_columns": list(expected)},
        )
    recertify_index: int | None = None
    if version != LEGACY_TEMPLATE_VERSION:
        for position, header in enumerate(headers):
            if _header_key(header) == _header_key(RECERTIFY_COLUMN):
                recertify_index = position
                break
    return required_count, commentary_index, recertify_index


def parse_commentary_workbook(
    content: bytes,
    *,
    max_bytes: int = MAX_TEMPLATE_BYTES,
    max_rows: int = MAX_TEMPLATE_ROWS,
) -> ParsedCommentaryTemplate:
    """Parse and validate a commentary workbook without touching the database."""
    if not content:
        raise WorkbookValidationError("The uploaded workbook is empty.")
    if len(content) > max_bytes:
        raise WorkbookValidationError(
            f"The uploaded workbook exceeds the {max_bytes // (1024 * 1024)} MiB limit.",
            code="file_too_large",
        )

    try:
        workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=False)
    except Exception as exc:  # openpyxl raises several unrelated exception types
        raise WorkbookValidationError("The uploaded file is not a readable XLSX workbook.") from exc

    try:
        if TEMPLATE_SHEET not in workbook.sheetnames or EXCEPTIONS_SHEET not in workbook.sheetnames:
            raise WorkbookValidationError(
                "The workbook is missing the Template or Exceptions sheet."
            )

        template = workbook[TEMPLATE_SHEET]
        version = _cell_text(template["B2"].value)
        if version not in (LEGACY_TEMPLATE_VERSION, TEMPLATE_VERSION):
            raise WorkbookValidationError(
                "The workbook template version is not supported.",
                details={
                    "supported_versions": [LEGACY_TEMPLATE_VERSION, TEMPLATE_VERSION],
                    "actual_version": version,
                },
            )

        try:
            as_of_date = parse_iso_date(template["B3"].value, field="As-of Date")
        except ValueError as exc:
            raise WorkbookValidationError(
                "The workbook As-of Date is missing or invalid.",
                code="invalid_as_of_date",
            ) from exc

        sheet = workbook[EXCEPTIONS_SHEET]
        rows = sheet.iter_rows()
        header_row = next(rows, None)
        if header_row is None:
            raise WorkbookValidationError("The Exceptions sheet has no header row.")
        required_count, commentary_index, recertify_index = _validated_headers(
            header_row, version
        )

        commentaries: dict[str, str] = {}
        recertifications: dict[str, str] = {}
        invalid_recertifications: list[dict[str, Any]] = []
        duplicates: list[str] = []
        seen: set[str] = set()
        row_count = 0
        for row_number, row in enumerate(rows, start=2):
            if row_number - 1 > max_rows:
                raise WorkbookValidationError(
                    f"The workbook exceeds the {max_rows:,}-row import limit.",
                    code="file_too_large",
                )
            cells = list(row) + [None] * (required_count - len(row))
            values = [cell.value if cell is not None else None for cell in cells]
            original_values = values[:required_count]
            if not any(value not in (None, "") for value in original_values):
                # Entirely blank required cells. Informational values alone
                # never create or invalidate an exception row.
                continue

            raw_id = values[0]
            exception_id = _cell_text(raw_id)
            if not exception_id:
                raise WorkbookValidationError(
                    f"Row {row_number} has no Exception ID.",
                    details={"row": row_number},
                )
            if len(exception_id) > MAX_EXCEPTION_ID_LENGTH:
                raise WorkbookValidationError(
                    f"Row {row_number} has an Exception ID that is too long.",
                    details={"row": row_number},
                )

            commentary_cell = cells[commentary_index]
            raw_commentary = values[commentary_index]
            if getattr(commentary_cell, "data_type", None) == "f" or (
                isinstance(raw_commentary, str) and raw_commentary.startswith("=")
            ):
                raise WorkbookValidationError(
                    f"Row {row_number} contains a formula in Commentary. "
                    "Enter literal text instead.",
                    code="invalid_commentary",
                    details={"row": row_number},
                )
            commentary = _restore_text(raw_commentary)
            if len(commentary) > MAX_COMMENTARY_LENGTH:
                raise WorkbookValidationError(
                    f"Row {row_number} commentary exceeds {MAX_COMMENTARY_LENGTH:,} characters.",
                    code="invalid_commentary",
                    details={"row": row_number},
                )

            if recertify_index is not None and recertify_index < len(cells):
                recertify_cell = cells[recertify_index]
                raw_recertify = (
                    recertify_cell.value if recertify_cell is not None else None
                )
                if getattr(recertify_cell, "data_type", None) == "f" or (
                    isinstance(raw_recertify, str) and raw_recertify.startswith("=")
                ):
                    invalid_recertifications.append(
                        {
                            "row": row_number,
                            "exception_id": exception_id,
                            "value": _restore_text(raw_recertify),
                        }
                    )
                else:
                    recertify_choice = _restore_text(raw_recertify).strip()
                    if recertify_choice not in ("", *RECERTIFY_OPTIONS):
                        invalid_recertifications.append(
                            {
                                "row": row_number,
                                "exception_id": exception_id,
                                "value": recertify_choice,
                            }
                        )
                    elif recertify_choice:
                        recertifications[exception_id] = recertify_choice

            if exception_id in seen:
                duplicates.append(exception_id)
            seen.add(exception_id)
            commentaries[exception_id] = commentary
            row_count += 1

        if invalid_recertifications:
            raise WorkbookValidationError(
                "The Commentary Recertify column contains invalid values. "
                "Leave the cell blank, or choose Keep Current or Updated.",
                code="invalid_recertification_selection",
                details={"invalid_rows": invalid_recertifications},
            )

        return ParsedCommentaryTemplate(
            as_of_date=as_of_date,
            commentaries=commentaries,
            row_count=row_count,
            duplicate_ids=tuple(dict.fromkeys(duplicates)),
            template_version=version,
            recertifications=recertifications,
        )
    finally:
        workbook.close()
