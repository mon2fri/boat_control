from __future__ import annotations

import pytest
from apps.validation_logic import (
    GroupingBranch,
    GroupingLeaf,
    TreeValidationError,
    collect_leaf_ids,
    evaluate_grouping_tree,
    is_null_or_blank,
    matches_value,
    matches_values,
    parse_grouping_tree,
    serialize_grouping_tree,
    validate_grouping_tree,
)


def leaf(condition_id: str) -> dict[str, str]:
    return {"kind": "leaf", "conditionId": condition_id}


NESTED = {
    "kind": "or",
    "children": [
        {
            "kind": "and",
            "children": [leaf("c0"), leaf("c1")],
        },
        leaf("c2"),
    ],
}


class TestTreeParsing:
    def test_none_is_absent(self) -> None:
        assert parse_grouping_tree(None) is None

    def test_nested_round_trip(self) -> None:
        parsed = parse_grouping_tree(NESTED)
        assert isinstance(parsed, GroupingBranch)
        assert isinstance(parsed.children[0], GroupingBranch)
        assert collect_leaf_ids(parsed) == {"c0", "c1", "c2"}
        assert serialize_grouping_tree(parsed) == NESTED

    @pytest.mark.parametrize(
        "value",
        [
            [],
            "tree",
            {"kind": "xor", "children": [leaf("c0"), leaf("c1")]},
            {"kind": "and"},
            {"kind": "and", "children": "not-a-list"},
            {"kind": "leaf"},
            {"kind": "leaf", "conditionId": ""},
        ],
    )
    def test_malformed_shapes_raise(self, value: object) -> None:
        with pytest.raises(TreeValidationError):
            parse_grouping_tree(value)

    def test_depth_limit_raises(self) -> None:
        node = leaf("c0")
        for _ in range(5):
            node = {"kind": "and", "children": [node, leaf("c0")]}
        with pytest.raises(TreeValidationError, match="maximum depth"):
            parse_grouping_tree(node, max_depth=3)

    def test_node_limit_raises(self) -> None:
        node = {
            "kind": "or",
            "children": [leaf(f"c{index}") for index in range(10)],
        }
        with pytest.raises(TreeValidationError, match="maximum size"):
            parse_grouping_tree(node, max_nodes=5)


class TestTreeValidation:
    def test_reports_unknown_duplicate_and_omitted_references(self) -> None:
        tree = parse_grouping_tree(
            {
                "kind": "and",
                "children": [leaf("c0"), leaf("c0"), leaf("c9")],
            }
        )
        errors = validate_grouping_tree(
            tree,
            item_count=3,
            expected_ids=["c0", "c1", "c2"],
        )
        assert any("Duplicate condition ID 'c0'" in error for error in errors)
        assert any("c9" in error and "non-existent" in error for error in errors)
        assert any("omits conditions: c1, c2" in error for error in errors)

    def test_empty_branch_and_invalid_leaf_format(self) -> None:
        tree = GroupingBranch(kind="and", children=())
        errors = validate_grouping_tree(tree, item_count=1)
        assert any("at least 2 children" in error for error in errors)

        invalid = GroupingLeaf(condition_id="x0")
        errors = validate_grouping_tree(invalid, item_count=1)
        assert any("Invalid condition ID format" in error for error in errors)

    def test_valid_tree_has_no_errors(self) -> None:
        tree = parse_grouping_tree(NESTED)
        assert (
            validate_grouping_tree(
                tree,
                item_count=3,
                expected_ids=["c0", "c1", "c2"],
            )
            == []
        )


class TestTreeEvaluation:
    @pytest.mark.parametrize(
        ("results", "expected"),
        [
            ((True, True, False), True),
            ((True, False, False), False),
            ((False, False, True), True),
            ((False, False, False), False),
        ],
    )
    def test_nested_truth_table(self, results: tuple[bool, ...], expected: bool) -> None:
        tree = parse_grouping_tree(NESTED)
        assert evaluate_grouping_tree(tree, results) is expected

    def test_mapping_results_and_absent_tree(self) -> None:
        tree = parse_grouping_tree(NESTED)
        assert evaluate_grouping_tree(tree, {"c0": True, "c1": False, "c2": True})
        assert evaluate_grouping_tree(None, []) is True
        assert evaluate_grouping_tree(tree, {"c0": True}) is False


class TestNullBlankPredicates:
    def test_blank_detection_keeps_whitespace_literal(self) -> None:
        assert is_null_or_blank(None) is True
        assert is_null_or_blank("") is True
        assert is_null_or_blank("   ") is False
        assert is_null_or_blank("0") is False

    @pytest.mark.parametrize("blank", [None, ""])
    @pytest.mark.parametrize(
        ("operator", "expected"),
        [
            ("eq", False),
            ("contains", False),
            ("neq", True),
            ("ncontains", True),
        ],
    )
    def test_single_value_semantics(self, blank: object, operator: str, expected: bool) -> None:
        assert matches_value(blank, operator, "Y") is expected

    @pytest.mark.parametrize("blank", [None, ""])
    @pytest.mark.parametrize(
        ("operator", "expected"),
        [
            ("eq", False),
            ("contains", False),
            ("neq", True),
            ("ncontains", True),
        ],
    )
    def test_multi_value_semantics(self, blank: object, operator: str, expected: bool) -> None:
        assert matches_values(blank, operator, ["Y", "N"]) is expected

    def test_multi_value_negative_requires_none_to_match(self) -> None:
        assert matches_values("ops", "neq", ["ops", "blocked"]) is False
        assert matches_values("other", "neq", ["ops", "blocked"]) is True
        assert matches_values("alpha", "contains", ["ph", "zzz"]) is True
        assert matches_values("alpha", "ncontains", ["ph", "zzz"]) is False

    def test_column_comparison_uses_same_null_semantics(self) -> None:
        assert matches_value(None, "eq", "Y") is False
        assert matches_value(None, "neq", "Y") is True
        assert matches_value("", "contains", "Y") is False
        assert matches_value("", "ncontains", "Y") is True
        assert matches_value("Y", "eq", None) is False
        assert matches_value("Y", "neq", None) is True

    def test_substring_matching_is_literal_not_regex(self) -> None:
        assert matches_value("a.b", "contains", ".") is True
        assert matches_value("a.b", "contains", "a.*") is False
        assert matches_value("ABC", "contains", "abc") is False
        assert matches_value(" a ", "eq", " a ") is True
        assert matches_value(" a ", "eq", "a") is False

    @pytest.mark.parametrize("blank", [None, ""])
    @pytest.mark.parametrize("operator", ["gt", "lt", "gte", "lte"])
    def test_numeric_operators_keep_missing_as_unsatisfied(
        self, blank: object, operator: str
    ) -> None:
        assert matches_value(blank, operator, "1") is False

    def test_numeric_operators_match_existing_behaviour(self) -> None:
        assert matches_value("10", "gt", "2") is True
        assert matches_value("10", "lt", "2") is False
        assert matches_value("10", "gte", "10") is True
        assert matches_value("10", "lte", "10") is True
        assert matches_value("not-numeric", "gt", "2") is False
        assert matches_values("10", "lt", ["2", "20"]) is True
