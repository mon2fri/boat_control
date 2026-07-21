from pathlib import Path

import pytest
from apps.files.filter_services import (
    FilterPreparationResult,
    get_column_values,
    parse_target_columns,
    prepare_filters,
    validate_filter,
    validate_target_columns,
)


@pytest.fixture
def csv_a(tmp_path: Path) -> Path:
    path = tmp_path / "a.csv"
    path.write_text("id,name,score\n1,alice,10\n2,bob,20\n3,charlie,30\n")
    return path


@pytest.fixture
def csv_b(tmp_path: Path) -> Path:
    path = tmp_path / "b.csv"
    path.write_text("id,name,value\n1,alice,100\n2,dave,200\n")
    return path


class TestGetColumnValues:
    def test_marks_values_in_one_file(self, csv_a: Path, csv_b: Path) -> None:
        """Values from both files; in_file_a/in_file_b set correctly."""
        result = get_column_values(csv_a, csv_b, "name")
        by_val = {v.value: v for v in result}
        # alice is in both files
        assert by_val["alice"].in_file_a is True
        assert by_val["alice"].in_file_b is True
        assert by_val["alice"].display == "alice"
        # bob is only in csv_a
        assert by_val["bob"].in_file_a is True
        assert by_val["bob"].in_file_b is False
        # dave is only in csv_b
        assert by_val["dave"].in_file_a is False
        assert by_val["dave"].in_file_b is True
        # charlie is only in csv_a
        assert by_val["charlie"].in_file_a is True
        assert by_val["charlie"].in_file_b is False


class TestPrepareFilters:
    def test_returns_columns_and_row_counts(self, csv_a: Path, csv_b: Path) -> None:
        result = prepare_filters(csv_a, csv_b, ["id", "name"])
        assert isinstance(result, FilterPreparationResult)
        assert result.total_rows_a == 3
        assert result.total_rows_b == 2
        assert result.columns == ["id", "name"]

    def test_requires_confirmation_for_large_datasets(self, tmp_path: Path) -> None:
        lines_a = "id,val\n" + "\n".join(f"{i},x" for i in range(1500)) + "\n"
        lines_b = "id,val\n" + "\n".join(f"{i},x" for i in range(1500)) + "\n"
        a = tmp_path / "a.csv"
        b = tmp_path / "b.csv"
        a.write_text(lines_a)
        b.write_text(lines_b)
        result = prepare_filters(a, b, ["id", "val"])
        assert result.requires_confirmation is True

    def test_no_confirmation_for_small_datasets(self, csv_a: Path, csv_b: Path) -> None:
        result = prepare_filters(csv_a, csv_b, ["id", "name"])
        assert result.requires_confirmation is False


class TestValidateFilter:
    def test_valid_filter(self) -> None:
        result = validate_filter("name", "eq", "alice", ["id", "name"])
        assert result.valid is True
        assert result.errors == []

    def test_invalid_column(self) -> None:
        result = validate_filter("missing", "eq", "x", ["id", "name"])
        assert result.valid is False
        assert any("not in common" in e for e in result.errors)

    def test_invalid_operator(self) -> None:
        result = validate_filter("name", "LIKE", "x", ["id", "name"])
        assert result.valid is False
        assert any("Invalid operator" in e for e in result.errors)

    def test_empty_value(self) -> None:
        result = validate_filter("name", "eq", "", ["id", "name"])
        assert result.valid is False
        assert any("empty" in e for e in result.errors)

    def test_star_value_accepted(self) -> None:
        result = validate_filter("name", "eq", "bob*", ["id", "name"])
        assert result.valid is True
        assert result.errors == []


class TestValidateTargetColumns:
    def test_none_returns_all(self) -> None:
        result = validate_target_columns(None, ["id", "name", "score"])
        assert result.valid_columns == ["id", "name", "score"]
        assert result.invalid_columns == []

    def test_validates_columns(self) -> None:
        result = validate_target_columns(["id", "bad"], ["id", "name"])
        assert "id" in result.valid_columns
        assert "bad" in result.invalid_columns


class TestParseTargetColumns:
    def test_parses_comma_separated(self) -> None:
        assert parse_target_columns("id, name , score") == ["id", "name", "score"]

    def test_empty_string(self) -> None:
        assert parse_target_columns("") == []

    def test_ignores_empty_parts(self) -> None:
        assert parse_target_columns("id,,name,") == ["id", "name"]
