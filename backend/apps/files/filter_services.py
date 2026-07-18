from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import polars as pl

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


def get_column_values(path_a: Path, path_b: Path, column: str) -> list[ColumnValueInfo]:
    df_a = pl.scan_csv(path_a).select(column).collect().drop_nulls()
    df_b = pl.scan_csv(path_b).select(column).collect().drop_nulls()

    vals_a = set(df_a[column].cast(pl.Utf8).to_list())
    vals_b = set(df_b[column].cast(pl.Utf8).to_list())

    all_values = vals_a | vals_b
    result = []
    for val in sorted(all_values):
        in_a = val in vals_a
        in_b = val in vals_b
        display = val if (in_a and in_b) else f"{val}*"
        result.append(ColumnValueInfo(value=val, in_file_a=in_a, in_file_b=in_b, display=display))
    return result


def prepare_filters(
    path_a: Path,
    path_b: Path,
    common_columns: list[str],
) -> FilterPreparationResult:
    row_count_a = pl.scan_csv(path_a).collect().height
    row_count_b = pl.scan_csv(path_b).collect().height
    total = row_count_a + row_count_b

    column_values: dict[str, list[ColumnValueInfo]] = {}
    for col in common_columns:
        column_values[col] = get_column_values(path_a, path_b, col)

    return FilterPreparationResult(
        columns=common_columns,
        column_values=column_values,
        total_rows_a=row_count_a,
        total_rows_b=row_count_b,
        requires_confirmation=total >= 2000,
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

    if filter_value.endswith("*"):
        errors.append("Cannot filter on values marked with '*' (present in only one file).")

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
