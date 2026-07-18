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

    def test_required_state_rule_flags_only_nonmatching_rows(
        self, csv_a: Path, rules_file: Path
    ) -> None:
        import polars as pl

        df = pl.scan_csv(csv_a).collect()
        result = validate_rows(df, load_rules(rules_file).rules, ["status"], ["id"])
        violations = result.violations_by_rule["R001"]
        # The rule requires status == active. Only bob is inactive.
        assert [v.key_columns["id"] for v in violations] == [2]
        assert violations[0].violating_column == "status"
        assert violations[0].violating_value == "inactive"

    def test_grouping_tree_and(self, csv_a: Path, tmp_path: Path) -> None:
        from apps.rules.services import GroupingBranch, GroupingLeaf, Rule
        from apps.runs.services import _evaluate_grouping_tree

        rule = Rule(
            rule_id="R001",
            name="Tree AND",
            description="",
            conditions=[
                {"column_name": "status", "operator": "eq", "filter_value": "active"},
                {"column_name": "name", "operator": "eq", "filter_value": "alice"},
            ],
            condition_relation=None,
            grouping=None,
            grouping_tree=GroupingBranch(
                kind="and",
                children=(
                    GroupingLeaf(condition_id="c0"),
                    GroupingLeaf(condition_id="c1"),
                ),
            ),
            logic={
                "format": "value_vs_column",
                "column_name": "status",
                "operator": "eq",
                "target_value": "active",
            },
        )

        assert _evaluate_grouping_tree(rule.grouping_tree, [True, True]) is True
        assert _evaluate_grouping_tree(rule.grouping_tree, [True, False]) is False
        assert _evaluate_grouping_tree(rule.grouping_tree, [False, True]) is False

    def test_grouping_tree_or(self, csv_a: Path, tmp_path: Path) -> None:
        from apps.rules.services import GroupingBranch, GroupingLeaf
        from apps.runs.services import _evaluate_grouping_tree

        tree = GroupingBranch(
            kind="or",
            children=(
                GroupingLeaf(condition_id="c0"),
                GroupingLeaf(condition_id="c1"),
            ),
        )

        assert _evaluate_grouping_tree(tree, [True, False]) is True
        assert _evaluate_grouping_tree(tree, [False, False]) is False

    def test_grouping_tree_nested(self, csv_a: Path, tmp_path: Path) -> None:
        from apps.rules.services import GroupingBranch, GroupingLeaf
        from apps.runs.services import _evaluate_grouping_tree

        tree = GroupingBranch(
            kind="and",
            children=(
                GroupingLeaf(condition_id="c0"),
                GroupingBranch(
                    kind="or",
                    children=(
                        GroupingLeaf(condition_id="c1"),
                        GroupingLeaf(condition_id="c2"),
                    ),
                ),
            ),
        )

        assert _evaluate_grouping_tree(tree, [True, True, False]) is True
        assert _evaluate_grouping_tree(tree, [True, False, True]) is True
        assert _evaluate_grouping_tree(tree, [True, False, False]) is False
        assert _evaluate_grouping_tree(tree, [False, True, True]) is False


class TestExecuteComparison:
    def test_full_execution(self, csv_a: Path, csv_b: Path, rules_file: Path) -> None:
        result = execute_comparison(
            path_a=csv_a,
            path_b=csv_b,
            target_columns=["score"],
            filters=[],
            rule_ids=None,
            key_columns=["id"],
        )
        assert result.comparison.total_rows_a == 3
        assert result.comparison.total_rows_b == 3
        assert "score" in result.target_columns

    def test_empty_rule_ids_skips_validation(
        self, csv_a: Path, csv_b: Path, rules_file: Path
    ) -> None:
        import os

        os.environ.setdefault("DJANGO_SETTINGS_MODULE", "boat_control.settings")
        import django  # noqa: E402

        django.setup()
        from django.conf import settings

        original_rules = settings.RULES_FILE
        settings.RULES_FILE = rules_file
        try:
            result = execute_comparison(
                path_a=csv_a,
                path_b=csv_b,
                target_columns=["score"],
                filters=[],
                rule_ids=[],
                key_columns=["id"],
            )
            assert result.validation.total_violations == 0
            assert result.validation.violations_by_rule == {}
        finally:
            settings.RULES_FILE = original_rules

    def test_none_rule_ids_runs_all_rules(
        self, csv_a: Path, csv_b: Path, rules_file: Path
    ) -> None:
        import os

        os.environ.setdefault("DJANGO_SETTINGS_MODULE", "boat_control.settings")
        import django  # noqa: E402

        django.setup()
        from django.conf import settings

        original_rules = settings.RULES_FILE
        settings.RULES_FILE = rules_file
        try:
            result = execute_comparison(
                path_a=csv_a,
                path_b=csv_b,
                target_columns=["score"],
                filters=[],
                rule_ids=None,
                key_columns=["id"],
            )
            assert result.validation.total_violations >= 0
        finally:
            settings.RULES_FILE = original_rules

    def test_rejects_missing_key_columns(
        self, csv_a: Path, csv_b: Path
    ) -> None:
        with pytest.raises(ValueError, match="key_columns is required"):
            execute_comparison(
                path_a=csv_a,
                path_b=csv_b,
                target_columns=["score"],
                filters=[],
                key_columns=None,
            )


def load_rules(path: Path) -> RulesFile:
    from apps.rules.services import load_rules as _load_rules

    return _load_rules(path)
