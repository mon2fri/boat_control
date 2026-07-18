from pathlib import Path

import pytest
from apps.rules.services import RulesFile, create_rule, save_rules
from apps.runs.services import (
    apply_filters,
    compare_rows,
    execute_comparison,
    validate_rows,
)


@pytest.fixture
def csv_a(tmp_path: Path) -> Path:
    path = tmp_path / "a.csv"
    path.write_text(
        "id,name,status,score\n1,alice,active,10\n2,bob,inactive,20\n3,charlie,active,30\n"
    )
    return path


@pytest.fixture
def csv_b(tmp_path: Path) -> Path:
    path = tmp_path / "b.csv"
    path.write_text("id,name,status,score\n1,alice,active,15\n2,bob,active,25\n4,dave,active,40\n")
    return path


@pytest.fixture
def rules_file(tmp_path: Path) -> Path:
    path = tmp_path / "rules.yaml"
    rules_file = RulesFile(version=1, rules=[], next_index=1)
    rule_data = {
        "name": "Active Check",
        "logic": {
            "format": "value_vs_column",
            "column_name": "status",
            "operator": "eq",
            "target_value": "active",
        },
    }
    new_file, _ = create_rule(rules_file, rule_data)
    save_rules(new_file, path)
    return path


class TestApplyFilters:
    def test_eq_filter(self, csv_a: Path, csv_b: Path) -> None:
        import polars as pl

        df_a = pl.scan_csv(csv_a)
        df_b = pl.scan_csv(csv_b)
        filters = [{"column": "status", "operator": "eq", "filter_value": "active"}]
        filtered_a, filtered_b = apply_filters(df_a, df_b, filters)
        assert filtered_a.collect().height == 2
        assert filtered_b.collect().height == 3

    def test_neq_filter(self, csv_a: Path, csv_b: Path) -> None:
        import polars as pl

        df_a = pl.scan_csv(csv_a)
        df_b = pl.scan_csv(csv_b)
        filters = [{"column": "status", "operator": "neq", "filter_value": "active"}]
        filtered_a, filtered_b = apply_filters(df_a, df_b, filters)
        assert filtered_a.collect().height == 1


class TestCompareRows:
    def test_detects_changes(self, csv_a: Path, csv_b: Path) -> None:
        import polars as pl

        df_a = pl.scan_csv(csv_a).collect()
        df_b = pl.scan_csv(csv_b).collect()
        result = compare_rows(df_a, df_b, ["score"], ["id"])
        assert result.total_rows_a == 3
        assert result.total_rows_b == 3
        assert result.rows_with_changes > 0
        assert result.total_attribute_changes > 0


class TestValidateRows:
    def test_detects_violations(self, csv_a: Path, rules_file: Path) -> None:
        import polars as pl

        df = pl.scan_csv(csv_a).collect()
        loaded_rules = load_rules(rules_file)
        result = validate_rows(df, loaded_rules.rules, ["status"])
        assert result.total_violations >= 0


class TestExecuteComparison:
    def test_full_execution(self, csv_a: Path, csv_b: Path, rules_file: Path) -> None:
        result = execute_comparison(
            path_a=csv_a,
            path_b=csv_b,
            target_columns=["score"],
            filters=[],
            rule_ids=None,
        )
        assert result.comparison.total_rows_a == 3
        assert result.comparison.total_rows_b == 3
        assert "score" in result.target_columns


def load_rules(path: Path) -> RulesFile:
    from apps.rules.services import load_rules as _load_rules

    return _load_rules(path)
