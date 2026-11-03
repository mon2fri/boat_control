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

from apps.exception_tracking.dates import parse_iso_date

TEMPLATE_VERSION = "exception_commentary/v1"
TEMPLATE_SHEET = "Template"
EXCEPTIONS_SHEET = "Exceptions"

EXCEPTION_HEADERS: tuple[str, ...] = (
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
_EXCEPTION_FIELDS: tuple[str, ...] = (
    "exception_id",
    "exception_rule_identifier",
    "key_columns",
    "exception_timestamp",
    "exception_commentary",
    "exception_as_of_date",
    "exception_first_seen_as_of_date",
    "exception_last_seen_as_of_date",
    "status",
)
_COMMENTARY_COLUMN = EXCEPTION_HEADERS.index("Exception Commentary")
_ID_COLUMN = EXCEPTION_HEADERS.index("Exception ID")

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


def build_commentary_workbook(
    records: Iterable[Mapping[str, Any]],
    as_of_date: date,
    *,
    generated_at: datetime | None = None,
) -> bytes:
    """Build the shared EXCEPTION commentary template.

    ``records`` uses the API record shape (the ten persisted columns plus
    ``status``). Text is written literally with formula-injection protection.
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
        "Edit only the Exception Commentary column. A blank commentary cell clears "
        "the value for this as-of date. Do not change exception IDs."
    )
    template.column_dimensions["A"].width = 24
    template.column_dimensions["B"].width = 90

    sheet = workbook.create_sheet(EXCEPTIONS_SHEET)
    sheet.append(list(EXCEPTION_HEADERS))
    _style_header(sheet)

    ordered = sorted(records, key=lambda item: _record_value(item, "exception_id"))
    for record in ordered:
        sheet.append([_protect_text(_record_value(record, field)) for field in _EXCEPTION_FIELDS])

    widths = (52, 34, 42, 26, 52, 22, 28, 28, 16)
    for index, width in enumerate(widths, start=1):
        sheet.column_dimensions[get_column_letter(index)].width = width
    for row in sheet.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = Alignment(vertical="top", wrap_text=True)
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = f"A1:{get_column_letter(len(EXCEPTION_HEADERS))}{max(sheet.max_row, 1)}"

    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _validated_headers(row: tuple[Any, ...]) -> tuple[str, ...]:
    headers = tuple(_cell_text(cell.value) for cell in row)
    expected = len(EXCEPTION_HEADERS)
    if len(headers) < expected or headers[:expected] != EXCEPTION_HEADERS:
        raise WorkbookValidationError(
            "The Exceptions sheet headers do not match the commentary template.",
            details={"expected_headers": list(EXCEPTION_HEADERS)},
        )
    if any(headers[expected:]):
        raise WorkbookValidationError(
            "The Exceptions sheet contains unexpected extra columns.",
            details={"expected_headers": list(EXCEPTION_HEADERS)},
        )
    return headers


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
        raise WorkbookValidationError(
            "The uploaded file is not a readable XLSX workbook."
        ) from exc

    try:
        if TEMPLATE_SHEET not in workbook.sheetnames or EXCEPTIONS_SHEET not in workbook.sheetnames:
            raise WorkbookValidationError(
                "The workbook is missing the Template or Exceptions sheet."
            )

        template = workbook[TEMPLATE_SHEET]
        version = _cell_text(template["B2"].value)
        if version != TEMPLATE_VERSION:
            raise WorkbookValidationError(
                "The workbook template version is not supported.",
                details={"expected_version": TEMPLATE_VERSION, "actual_version": version},
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
        _validated_headers(header_row)

        commentaries: dict[str, str] = {}
        duplicates: list[str] = []
        seen: set[str] = set()
        row_count = 0
        for row_number, row in enumerate(rows, start=2):
            if row_number - 1 > max_rows:
                raise WorkbookValidationError(
                    f"The workbook exceeds the {max_rows:,}-row import limit.",
                    code="file_too_large",
                )
            cells = list(row) + [None] * (len(EXCEPTION_HEADERS) - len(row))
            values = [cell.value if cell is not None else None for cell in cells]
            if not any(value not in (None, "") for value in values):
                continue

            raw_id = values[_ID_COLUMN]
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

            commentary_cell = cells[_COMMENTARY_COLUMN]
            raw_commentary = values[_COMMENTARY_COLUMN]
            if getattr(commentary_cell, "data_type", None) == "f" or (
                isinstance(raw_commentary, str) and raw_commentary.startswith("=")
            ):
                raise WorkbookValidationError(
                    f"Row {row_number} contains a formula in Exception Commentary. "
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

            if exception_id in seen:
                duplicates.append(exception_id)
            seen.add(exception_id)
            commentaries[exception_id] = commentary
            row_count += 1

        return ParsedCommentaryTemplate(
            as_of_date=as_of_date,
            commentaries=commentaries,
            row_count=row_count,
            duplicate_ids=tuple(dict.fromkeys(duplicates)),
        )
    finally:
        workbook.close()
