"""Shared validation for Extra Columns for Commentary Template.

The setting is distinct from the existing ``Extra Column`` selection and from
attribute-comparison sections. Only this ordered selection supplies source-data
columns appended to the commentary workbook and displayed by Exception Tracking.

Wire/config names are frozen with Worker D:

* run request: ``commentary_template_columns`` — ordered list of concrete column
  names;
* rows-and-columns config: ``commentaryTemplateColumns`` — ordered ``ColumnRef``
  list (string or ``{kind, name}``), persisted verbatim.

Legacy configs that omit the field resolve to an empty selection. Backend
normalization never infers this list from ``extraColumns``, ``exception_columns``,
rule extra columns or comparison sections.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

RUN_FIELD = "commentary_template_columns"
CONFIG_FIELD = "commentaryTemplateColumns"
LABEL = "Extra Columns for Commentary Template"

# Headers owned by the commentary workbook itself. Selecting a source column
# with one of these names would create duplicate headers, so it is rejected
# rather than silently renamed or dropped.
RESERVED_HEADERS = frozenset(
    {
        "exception id",
        "exception status",
        "commentary",
        "exception commentary",
        "rule index",
        "exception rule identifier",
        "key columns",
        "exception timestamp",
        "exception as-of date",
        "exception first seen as-of date",
        "exception last seen as-of date",
        "exception first seen timestamp",
        "exception last seen timestamp",
    }
)


class TemplateColumnError(ValueError):
    """Raised when a commentary-template column selection is invalid."""


def _display_name(value: str) -> str:
    return " ".join(value.strip().casefold().split())


def is_reserved_header(name: str) -> bool:
    return _display_name(name) in RESERVED_HEADERS


def validate_concrete_columns(value: object) -> list[str]:
    """Validate the ordered run-request selection of concrete column names."""

    if value is None:
        return []
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence):
        raise TemplateColumnError(
            f"{LABEL} must be an ordered list of column names."
        )

    names: list[str] = []
    seen: set[str] = set()
    for index, raw in enumerate(value, start=1):
        if not isinstance(raw, str):
            raise TemplateColumnError(
                f"{LABEL} entry {index} must be a column name string."
            )
        name = raw
        if not name.strip():
            raise TemplateColumnError(
                f"{LABEL} entry {index} must not be empty."
            )
        token = _display_name(name)
        if token in seen:
            raise TemplateColumnError(
                f"{LABEL} contains duplicate column '{name}'."
            )
        if is_reserved_header(name):
            raise TemplateColumnError(
                f"{LABEL} cannot include reserved template header '{name}'."
            )
        seen.add(token)
        names.append(name)
    return names


def _ref_identity(ref: Any, index: int) -> tuple[str, str, Any]:
    if isinstance(ref, str):
        name = ref
        kind = "column"
    elif isinstance(ref, Mapping):
        kind_value = ref.get("kind", "column")
        name_value = ref.get("name")
        if kind_value not in ("column", "column_family"):
            raise TemplateColumnError(
                f"{LABEL} entry {index} has unsupported column reference kind "
                f"'{kind_value}'."
            )
        if not isinstance(name_value, str):
            raise TemplateColumnError(
                f"{LABEL} entry {index} must include a column or family name."
            )
        kind = str(kind_value)
        name = name_value
    else:
        raise TemplateColumnError(
            f"{LABEL} entry {index} must be a column name or column reference."
        )

    if not name.strip():
        raise TemplateColumnError(f"{LABEL} entry {index} must not be empty.")
    if is_reserved_header(name):
        raise TemplateColumnError(
            f"{LABEL} cannot include reserved template header '{name}'."
        )
    return kind, name, ref


def normalize_config_selection(value: object) -> list[Any]:
    """Validate and return the ordered config selection, preserving ref shapes.

    Missing/``None`` means an empty selection for legacy configs. Strings and
    ``{kind: column|column_family, name}`` references are preserved verbatim so
    the frontend can resolve families later without the backend guessing.
    """

    if value is None:
        return []
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence):
        raise TemplateColumnError(
            f"{LABEL} in Config for rows and columns must be an ordered list."
        )

    selection: list[Any] = []
    seen: set[tuple[str, str]] = set()
    for index, ref in enumerate(value, start=1):
        kind, name, original = _ref_identity(ref, index)
        token = (kind, _display_name(name))
        if token in seen:
            raise TemplateColumnError(
                f"{LABEL} contains duplicate column reference '{name}'."
            )
        seen.add(token)
        selection.append(original)
    return selection


def normalize_rows_and_columns_content(content: Any) -> dict[str, Any]:
    """Return config content with the ordered selection always explicit.

    A missing field from an older config becomes ``[]`` rather than inheriting
    anything from the current frontend session. Other content is preserved
    unchanged.
    """

    if not isinstance(content, dict):
        raise TemplateColumnError(
            "Config for rows and columns content must be a JSON object."
        )
    normalized = dict(content)
    normalized[CONFIG_FIELD] = normalize_config_selection(
        normalized.get(CONFIG_FIELD)
    )
    return normalized
