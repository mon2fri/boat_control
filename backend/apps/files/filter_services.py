from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import polars as pl

from apps.settings.services import load_settings

FilterOperator = Literal["eq", "neq", "contains", "ncontains"]

VALID_FILTER_OPERATORS: set[FilterOperator] = {"eq", "neq", "contains", "ncontains"}


@dataclass(frozen=True)
class ColumnValueInfo:
    value: str
    in_file_a: bool
    in_file_b: bool
    display: str


@dataclass(frozen=True)
class FilterPreparationResult:
    columns: list[str]
    column_values: dict[str, list[ColumnValueInfo]]
    total_rows_a: int
    total_rows_b: int
    requires_confirmation: bool


@dataclass(frozen=True)
class FilterValidationResult:
    valid: bool
    errors: list[str]


@dataclass(frozen=True)
class TargetColumnsResult:
    valid_columns: list[str]
    invalid_columns: list[str]
    all_common_columns: list[str]


def _read_csv(path: Path) -> pl.DataFrame:
    """Read a CSV with every column forced to string to avoid type-inference errors."""
    return pl.read_csv(path, infer_schema=False)


def get_column_values(df_a: pl.DataFrame, df_b: pl.DataFrame, column: str) -> list[ColumnValueInfo]:
    """Read values from both in-memory frames and mark which file each value appears in."""
    vals_a = set(df_a[column].drop_nulls().to_list())
    vals_b = set(df_b[column].drop_nulls().to_list())

    result = []
    for val in sorted(vals_a | vals_b):
        display = str(val)
        result.append(ColumnValueInfo(
            value=val,
            in_file_a=val in vals_a,
            in_file_b=val in vals_b,
            display=display,
        ))
    return result


def prepare_filters(
    path_a: Path,
    path_b: Path,
    common_columns: list[str],
) -> FilterPreparationResult:
    # Read each file into memory once, then compute every column's value set
    # from the frames. This avoids re-scanning the files from disk once per
    # column, which is significant for large uploads.
    df_a = _read_csv(path_a)
    df_b = _read_csv(path_b)
    total = df_a.height + df_b.height

    column_values: dict[str, list[ColumnValueInfo]] = {}
    for col in common_columns:
        column_values[col] = get_column_values(df_a, df_b, col)

    return FilterPreparationResult(
        columns=common_columns,
        column_values=column_values,
        total_rows_a=df_a.height,
        total_rows_b=df_b.height,
        requires_confirmation=total >= load_settings().full_set_confirmation_rows,
    )


def validate_filter(
    column: str,
    operator: str,
    filter_value: str,
    common_columns: list[str],
) -> FilterValidationResult:
    errors: list[str] = []

    if column not in common_columns:
        errors.append(f"Column '{column}' is not in common columns.")

    if operator not in VALID_FILTER_OPERATORS:
        valid_ops = ", ".join(sorted(VALID_FILTER_OPERATORS))
        errors.append(f"Invalid operator '{operator}'. Must be one of: {valid_ops}")

    if not filter_value or not filter_value.strip():
        errors.append("Filter value cannot be empty.")

    return FilterValidationResult(valid=len(errors) == 0, errors=errors)


def validate_target_columns(
    target_columns: list[str] | None,
    common_columns: list[str],
) -> TargetColumnsResult:
    if not target_columns:
        return TargetColumnsResult(
            valid_columns=common_columns,
            invalid_columns=[],
            all_common_columns=common_columns,
        )

    valid = [c for c in target_columns if c in common_columns]
    invalid = [c for c in target_columns if c not in common_columns]

    return TargetColumnsResult(
        valid_columns=valid if valid else common_columns,
        invalid_columns=invalid,
        all_common_columns=common_columns,
    )


def parse_target_columns(input_str: str) -> list[str]:
    return [c.strip() for c in input_str.split(",") if c.strip()]
