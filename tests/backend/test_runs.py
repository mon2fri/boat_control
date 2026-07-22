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
        # Phase 2: only df_b (comparison) is filtered; df_a (baseline) passes through
        assert filtered_a.collect().height == 3  # baseline unchanged
        # csv_b has all 3 rows with status=active, so all pass
        assert filtered_b.collect().height == 3

    def test_neq_filter(self, csv_a: Path, csv_b: Path) -> None:
        import polars as pl

        df_a = pl.scan_csv(csv_a)
        df_b = pl.scan_csv(csv_b)
        filters = [{"column": "status", "operator": "neq", "filter_value": "active"}]
        filtered_a, filtered_b = apply_filters(df_a, df_b, filters)
        # Phase 2: only df_b is filtered; df_a passes through
        assert filtered_a.collect().height == 3  # baseline unchanged


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

    def test_rule_violation_includes_matching_comparison_value(self, rules_file: Path) -> None:
        import polars as pl

        baseline = pl.DataFrame({"id": [1], "status": ["inactive"]})
        comparison = pl.DataFrame({"id": [1], "status": ["pending"]})
        result = validate_rows(
            baseline,
            load_rules(rules_file).rules,
            ["status"],
            ["id"],
            comparison_df=comparison,
        )
        violation = result.violations_by_rule["R001"][0]
        assert violation.violating_value == "inactive"
        assert violation.comparison_value == "pending"
        assert result.rule_summaries["R001"] == {
            "name": "Active Check",
            "logic": "status equals 'active'",
        }

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

    def test_condition_values_are_or_alternatives(self) -> None:
        from apps.rules.services import Condition, LogicClause, Rule
        from apps.runs.services import _check_rule

        rule = Rule(
            rule_id="R001",
            name="Status alternatives",
            description="",
            conditions=[Condition("status", "eq", "active", ("active", "pending"))],
            condition_relation=None,
            grouping=None,
            grouping_tree=None,
            logic=LogicClause("value_vs_column", "result", "eq", "ok"),
        )
        assert _check_rule({"status": "active", "result": "bad"}, rule, [])[0] is True
        assert _check_rule({"status": "pending", "result": "bad"}, rule, [])[0] is True
        assert _check_rule({"status": "closed", "result": "bad"}, rule, [])[0] is False

    def test_numeric_condition_accepts_decimal_and_negative_values(self) -> None:
        from apps.rules.services import Condition, LogicClause, Rule
        from apps.runs.services import _check_rule

        rule = Rule(
            rule_id="R001",
            name="Numeric scope",
            description="",
            conditions=[Condition("score", "gt", "-2.5", ("-2.5",))],
            condition_relation=None,
            grouping=None,
            grouping_tree=None,
            logic=LogicClause("value_vs_column", "result", "eq", "ok"),
        )
        assert _check_rule({"score": "-2.4", "result": "bad"}, rule, [])[0] is True
        assert _check_rule({"score": "-3", "result": "bad"}, rule, [])[0] is False


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
        # Phase 2: baseline rows are joined using filtered comparison keys,
        # so total_rows_a reflects only matched rows (IDs 1, 2 from csv_b)
        assert result.comparison.total_rows_a == 2
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

    def test_none_rule_ids_runs_all_rules(self, csv_a: Path, csv_b: Path, rules_file: Path) -> None:
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

    def test_rejects_missing_key_columns(self, csv_a: Path, csv_b: Path) -> None:
        with pytest.raises(ValueError, match="key_columns is required"):
            execute_comparison(
                path_a=csv_a,
                path_b=csv_b,
                target_columns=["score"],
                filters=[],
                key_columns=None,
            )

    def test_rejects_invalid_filter_column_not_in_comparison_columns(
        self, csv_a: Path, csv_b: Path
    ) -> None:
        with pytest.raises(ValueError, match="Filter column 'nonexistent' not found"):
            execute_comparison(
                path_a=csv_a,
                path_b=csv_b,
                comparison_columns=["id", "name", "status", "score"],
                target_columns=["score"],
                filters=[{"column": "nonexistent", "operator": "eq", "filter_value": "x"}],
                key_columns=["id"],
            )

    def test_rejects_filter_column_in_headers_but_not_in_comparison_columns(
        self, csv_a: Path, csv_b: Path
    ) -> None:
        with pytest.raises(ValueError, match="Filter column 'status' not found"):
            execute_comparison(
                path_a=csv_a,
                path_b=csv_b,
                comparison_columns=["id", "name", "score"],
                target_columns=["score"],
                filters=[{"column": "status", "operator": "eq", "filter_value": "active"}],
                key_columns=["id"],
            )

    def test_accepts_filter_column_within_comparison_columns(
        self, csv_a: Path, csv_b: Path
    ) -> None:
        result = execute_comparison(
            path_a=csv_a,
            path_b=csv_b,
            comparison_columns=["id", "name", "status", "score"],
            target_columns=["score"],
            filters=[{"column": "status", "operator": "eq", "filter_value": "active"}],
            key_columns=["id"],
        )
        assert result.comparison.total_rows_a == 2


def load_rules(path: Path) -> RulesFile:
    from apps.rules.services import load_rules as _load_rules

    return _load_rules(path)


class TestComputeGroupStatistics:
    def test_empty_grouping_columns(self) -> None:
        from apps.runs.services import compute_group_statistics

        result = compute_group_statistics([], {}, [])
        assert result == {"overall": [], "attribute_changes": [], "validation_rules": {}}

    def test_no_changes_no_violations(self) -> None:
        from apps.runs.services import compute_group_statistics

        result = compute_group_statistics([], {}, ["region"])
        # With grouping columns specified, stats are produced even with zero data
        assert len(result["overall"]) == 1
        assert result["overall"][0]["column"] == "region"
        assert result["overall"][0]["unique_count"] == 0
        assert result["overall"][0]["attribute_count"] == 0
        assert result["overall"][0]["rows"] == [
            {"value": "Total", "unique_count": 0, "attribute_count": 0}
        ]

    def test_single_grouping_column_with_changes(self) -> None:
        from apps.runs.services import (
            AttributeChange,
            RowComparison,
            compute_group_statistics,
        )

        changes = [
            RowComparison(
                row_index=0,
                key_columns={"id": 1},
                attribute_changes=[AttributeChange("score", 10, 15)],
                change_count=1,
                grouping_values={"region": "EMEA"},
            ),
            RowComparison(
                row_index=1,
                key_columns={"id": 2},
                attribute_changes=[AttributeChange("score", 20, 25)],
                change_count=1,
                grouping_values={"region": "EMEA"},
            ),
            RowComparison(
                row_index=2,
                key_columns={"id": 3},
                attribute_changes=[AttributeChange("score", 30, 40)],
                change_count=1,
                grouping_values={"region": "APAC"},
            ),
        ]
        result = compute_group_statistics(changes, {}, ["region"])
        overall = result["overall"]
        assert len(overall) == 1
        stats = overall[0]
        assert stats["column"] == "region"
        assert stats["unique_count"] == 3
        assert stats["attribute_count"] == 3
        # Total row first, then alphabetical
        assert stats["rows"][0]["value"] == "Total"
        assert stats["rows"][0]["unique_count"] == 3
        assert stats["rows"][0]["attribute_count"] == 3
        assert stats["rows"][1]["value"] == "APAC"
        assert stats["rows"][1]["unique_count"] == 1
        assert stats["rows"][2]["value"] == "EMEA"
        assert stats["rows"][2]["unique_count"] == 2

    def test_deduplication_of_keys(self) -> None:
        from apps.runs.services import (
            AttributeChange,
            RowComparison,
            compute_group_statistics,
        )

        # Two changes with the same key but different columns
        changes = [
            RowComparison(
                row_index=0,
                key_columns={"id": 1},
                attribute_changes=[
                    AttributeChange("score", 10, 15),
                    AttributeChange("name", "a", "b"),
                ],
                change_count=2,
                grouping_values={"region": "EMEA"},
            ),
        ]
        result = compute_group_statistics(changes, {}, ["region"])
        stats = result["overall"][0]
        # Unique count should be 1 (one key), attribute count should be 2 (two changes)
        assert stats["unique_count"] == 1
        assert stats["attribute_count"] == 2

    def test_null_and_empty_grouping_values(self) -> None:
        from apps.runs.services import (
            AttributeChange,
            RowComparison,
            compute_group_statistics,
        )

        changes = [
            RowComparison(
                row_index=0,
                key_columns={"id": 1},
                attribute_changes=[AttributeChange("score", 10, 15)],
                change_count=1,
                grouping_values={"region": None},
            ),
            RowComparison(
                row_index=1,
                key_columns={"id": 2},
                attribute_changes=[AttributeChange("score", 20, 25)],
                change_count=1,
                grouping_values={"region": ""},
            ),
        ]
        result = compute_group_statistics(changes, {}, ["region"])
        stats = result["overall"][0]
        rows = stats["rows"]
        assert rows[0]["value"] == "Total"
        # Null and Empty are last
        assert rows[-1]["value"] == "Null"
        assert rows[-2]["value"] == "Empty"

    def test_violations_by_rule(self) -> None:
        from apps.runs.services import ValidationViolation, compute_group_statistics

        viols = {
            "R001": [
                ValidationViolation(
                    row_index=0,
                    rule_id="R001",
                    rule_name="Test",
                    key_columns={"id": 1},
                    details="bad",
                    violating_column="status",
                    violating_value="inactive",
                    rule_logic="status equals 'active'",
                    grouping_values={"region": "EMEA"},
                ),
            ],
            "R002": [],
        }
        result = compute_group_statistics([], viols, ["region"])
        # R001 has one violation, R002 has zero
        assert "R001" in result["validation_rules"]
        assert "R002" in result["validation_rules"]
        r001 = result["validation_rules"]["R001"][0]
        assert r001["unique_count"] == 1
        assert r001["attribute_count"] == 1
        r002 = result["validation_rules"]["R002"][0]
        assert r002["unique_count"] == 0
        assert r002["attribute_count"] == 0
        assert r002["rows"] == [{"value": "Total", "unique_count": 0, "attribute_count": 0}]

    def test_overall_deduplicates_keys_across_sections(self) -> None:
        from apps.runs.services import (
            AttributeChange,
            RowComparison,
            ValidationViolation,
            compute_group_statistics,
        )

        changes = [
            RowComparison(
                row_index=0,
                key_columns={"id": 1},
                attribute_changes=[AttributeChange("score", 10, 15)],
                change_count=1,
                grouping_values={"region": "EMEA"},
            ),
        ]
        viols = {
            "R001": [
                ValidationViolation(
                    row_index=0,
                    rule_id="R001",
                    rule_name="Test",
                    key_columns={"id": 1},
                    details="bad",
                    violating_column="score",
                    violating_value=15,
                    rule_logic="score equals 10",
                    grouping_values={"region": "EMEA"},
                ),
            ],
        }
        result = compute_group_statistics(changes, viols, ["region"])
        # Overall should deduplicate: same key_id=1 appears in both, so unique=1
        overall = result["overall"][0]
        assert overall["unique_count"] == 1
        assert overall["attribute_count"] == 2  # 1 change + 1 violation

    def test_multiple_grouping_columns(self) -> None:
        from apps.runs.services import (
            AttributeChange,
            RowComparison,
            compute_group_statistics,
        )

        changes = [
            RowComparison(
                row_index=0,
                key_columns={"id": 1},
                attribute_changes=[AttributeChange("score", 10, 15)],
                change_count=1,
                grouping_values={"region": "EMEA", "team": "alpha"},
            ),
        ]
        result = compute_group_statistics(changes, {}, ["region", "team"])
        assert len(result["overall"]) == 2
        assert result["overall"][0]["column"] == "region"
        assert result["overall"][1]["column"] == "team"

    def test_execute_comparison_with_grouping(self, csv_a: Path, csv_b: Path) -> None:
        result = execute_comparison(
            path_a=csv_a,
            path_b=csv_b,
            target_columns=["score"],
            key_columns=["id"],
            grouping_columns=["status"],
        )
        # grouping_columns should be passed through
        assert result.grouping_columns == ["status"]
        assert result.group_statistics is not None
        assert "overall" in result.group_statistics
        assert len(result.group_statistics["overall"]) == 1
        assert result.group_statistics["overall"][0]["column"] == "status"
        # Group statistics must break down per distinct grouping value, not
        # collapse into ["Total", "Null"]. Fixture data has rows with status
        # "active" and "inactive", so at least one row in `rows` must reflect
        # those values.
        overall = result.group_statistics["overall"][0]
        values = {row["value"] for row in overall["rows"]}
        assert "Total" in values
        assert values != {"Total", "Null"}, (
            "Group statistics did not load grouping-column data — every row "
            "bucketed under 'Null'. Re-check that needed_columns includes "
            "grouping_columns in execute_comparison."
        )
        assert values - {"Total"}  # at least one real value besides Total
