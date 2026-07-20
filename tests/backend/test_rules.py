from pathlib import Path

import pytest
from apps.rules.services import (
    GroupingBranch,
    GroupingLeaf,
    RulesFile,
    _collect_condition_ids,
    _parse_grouping_tree,
    _serialize_grouping_tree,
    _validate_grouping_tree,
    create_rule,
    delete_rule,
    load_rules,
    save_rules,
    update_rule,
    validate_rule,
)


@pytest.fixture
def rules_path(tmp_path: Path) -> Path:
    return tmp_path / "rules.yaml"


@pytest.fixture
def sample_rule_data() -> dict:
    return {
        "name": "Test Rule",
        "description": "A test rule",
        "logic": {
            "format": "value_vs_column",
            "column_name": "status",
            "operator": "eq",
            "target_value": "active",
        },
    }


@pytest.fixture
def rule_with_conditions() -> dict:
    return {
        "name": "Rule With Conditions",
        "description": "Rule with multiple conditions",
        "conditions": [
            {"column_name": "status", "operator": "eq", "filter_value": "active"},
            {"column_name": "type", "operator": "eq", "filter_value": "premium"},
        ],
        "condition_relation": "and",
        "logic": {
            "format": "value_vs_column",
            "column_name": "score",
            "operator": "gt",
            "target_value": "100",
        },
    }


class TestValidateRule:
    def test_valid_simple_rule(self, sample_rule_data: dict) -> None:
        result = validate_rule(sample_rule_data)
        assert result.valid is True
        assert result.errors == []

    def test_missing_name(self) -> None:
        logic = {
            "format": "value_vs_column",
            "column_name": "x",
            "operator": "eq",
            "target_value": "y",
        }
        result = validate_rule({"logic": logic})
        assert result.valid is False
        assert any("name" in e for e in result.errors)

    def test_missing_logic(self) -> None:
        result = validate_rule({"name": "test"})
        assert result.valid is False
        assert any("Logic" in e for e in result.errors)

    def test_invalid_logic_format(self) -> None:
        logic = {"format": "invalid", "column_name": "x", "operator": "eq", "target_value": "y"}
        result = validate_rule({"name": "test", "logic": logic})
        assert result.valid is False
        assert any("format" in e for e in result.errors)

    def test_conditions_require_relation(self) -> None:
        logic = {
            "format": "value_vs_column",
            "column_name": "x",
            "operator": "eq",
            "target_value": "y",
        }
        result = validate_rule(
            {
                "name": "test",
                "conditions": [
                    {"column_name": "a", "operator": "eq", "filter_value": "1"},
                    {"column_name": "b", "operator": "eq", "filter_value": "2"},
                ],
                "logic": logic,
            }
        )
        assert result.valid is False
        assert any("condition_relation" in e for e in result.errors)


class TestCreateRule:
    def test_creates_rule_with_auto_id(self, rules_path: Path, sample_rule_data: dict) -> None:
        rules_file = RulesFile(version=1, rules=[], next_index=1)
        new_file, rule = create_rule(rules_file, sample_rule_data)
        assert rule.rule_id == "R001"
        assert new_file.next_index == 2
        assert len(new_file.rules) == 1

    def test_increments_id(self, rules_path: Path, sample_rule_data: dict) -> None:
        rules_file = RulesFile(version=1, rules=[], next_index=5)
        new_file, rule = create_rule(rules_file, sample_rule_data)
        assert rule.rule_id == "R005"


class TestUpdateRule:
    def test_updates_existing_rule(self, sample_rule_data: dict) -> None:
        rules_file = RulesFile(version=1, rules=[], next_index=1)
        new_file, rule = create_rule(rules_file, sample_rule_data)

        updated_data = {**sample_rule_data, "name": "Updated Rule"}
        updated_file = update_rule(new_file, rule.rule_id, updated_data)
        assert updated_file.rules[0].name == "Updated Rule"

    def test_raises_on_missing_rule(self, sample_rule_data: dict) -> None:
        rules_file = RulesFile(version=1, rules=[], next_index=1)
        with pytest.raises(ValueError, match="not found"):
            update_rule(rules_file, "R999", sample_rule_data)


class TestDeleteRule:
    def test_deletes_rule(self, sample_rule_data: dict) -> None:
        rules_file = RulesFile(version=1, rules=[], next_index=1)
        new_file, rule = create_rule(rules_file, sample_rule_data)
        deleted_file = delete_rule(new_file, rule.rule_id)
        assert len(deleted_file.rules) == 0

    def test_raises_on_missing_rule(self) -> None:
        rules_file = RulesFile(version=1, rules=[], next_index=1)
        with pytest.raises(ValueError, match="not found"):
            delete_rule(rules_file, "R999")


class TestSaveAndLoadRules:
    def test_round_trip(self, rules_path: Path, sample_rule_data: dict) -> None:
        rules_file = RulesFile(version=1, rules=[], next_index=1)
        new_file, _ = create_rule(rules_file, sample_rule_data)
        save_rules(new_file, rules_path)

        loaded = load_rules(rules_path)
        assert loaded.version == 1
        assert len(loaded.rules) == 1
        assert loaded.rules[0].name == "Test Rule"

    def test_load_nonexistent_returns_empty(self, tmp_path: Path) -> None:
        loaded = load_rules(tmp_path / "nonexistent.yaml")
        assert loaded.rules == []
        assert loaded.next_index == 1


class TestGroupingTreeParsing:
    def test_parse_none_returns_none(self) -> None:
        assert _parse_grouping_tree(None) is None

    def test_parse_leaf(self) -> None:
        node = _parse_grouping_tree({"kind": "leaf", "conditionId": "c0"})
        assert isinstance(node, GroupingLeaf)
        assert node.condition_id == "c0"

    def test_parse_and_branch(self) -> None:
        node = _parse_grouping_tree(
            {
                "kind": "and",
                "children": [
                    {"kind": "leaf", "conditionId": "c0"},
                    {"kind": "leaf", "conditionId": "c1"},
                ],
            }
        )
        assert isinstance(node, GroupingBranch)
        assert node.kind == "and"
        assert len(node.children) == 2

    def test_parse_nested_tree(self) -> None:
        node = _parse_grouping_tree(
            {
                "kind": "or",
                "children": [
                    {
                        "kind": "and",
                        "children": [
                            {"kind": "leaf", "conditionId": "c0"},
                            {"kind": "leaf", "conditionId": "c1"},
                        ],
                    },
                    {"kind": "leaf", "conditionId": "c2"},
                ],
            }
        )
        assert isinstance(node, GroupingBranch)
        assert node.kind == "or"
        assert isinstance(node.children[0], GroupingBranch)
        assert isinstance(node.children[1], GroupingLeaf)


class TestGroupingTreeSerialization:
    def test_round_trip(self) -> None:
        original = {
            "kind": "or",
            "children": [
                {
                    "kind": "and",
                    "children": [
                        {"kind": "leaf", "conditionId": "c0"},
                        {"kind": "leaf", "conditionId": "c1"},
                    ],
                },
                {"kind": "leaf", "conditionId": "c2"},
            ],
        }
        parsed = _parse_grouping_tree(original)
        serialized = _serialize_grouping_tree(parsed)
        assert serialized == original

    def test_serialize_none(self) -> None:
        assert _serialize_grouping_tree(None) is None


class TestGroupingTreeValidation:
    def test_valid_tree(self) -> None:
        tree = GroupingBranch(
            kind="and",
            children=(GroupingLeaf(condition_id="c0"), GroupingLeaf(condition_id="c1")),
        )
        errors = _validate_grouping_tree(tree, 2)
        assert errors == []

    def test_references_nonexistent_condition(self) -> None:
        tree = GroupingLeaf(condition_id="c5")
        errors = _validate_grouping_tree(tree, 2)
        assert len(errors) == 1
        assert "c5" in errors[0]

    def test_duplicate_condition_ids(self) -> None:
        tree = GroupingBranch(
            kind="and",
            children=(GroupingLeaf(condition_id="c0"), GroupingLeaf(condition_id="c0")),
        )
        errors = _validate_grouping_tree(tree, 2)
        assert any("Duplicate" in e for e in errors)

    def test_branch_with_single_child(self) -> None:
        tree = GroupingBranch(
            kind="or",
            children=(GroupingLeaf(condition_id="c0"),),
        )
        errors = _validate_grouping_tree(tree, 2)
        assert any("at least 2 children" in e for e in errors)


class TestGroupingTreeOmitsConditions:
    def test_validate_rule_rejects_omitted_conditions(self) -> None:
        data = {
            "name": "Test",
            "conditions": [
                {"column_name": "a", "operator": "eq", "filter_value": "1"},
                {"column_name": "b", "operator": "eq", "filter_value": "2"},
            ],
            "grouping_tree": {
                "kind": "and",
                "children": [
                    {"kind": "leaf", "conditionId": "c0"},
                ],
            },
            "logic": {
                "format": "value_vs_column",
                "column_name": "x",
                "operator": "eq",
                "target_value": "y",
            },
        }
        result = validate_rule(data)
        assert result.valid is False
        assert any("omits conditions" in e for e in result.errors)
        assert any("c1" in e for e in result.errors)


class TestGroupingTreeCollectIds:
    def test_collect_from_nested(self) -> None:
        node = _parse_grouping_tree(
            {
                "kind": "or",
                "children": [
                    {"kind": "leaf", "conditionId": "c0"},
                    {
                        "kind": "and",
                        "children": [
                            {"kind": "leaf", "conditionId": "c1"},
                            {"kind": "leaf", "conditionId": "c2"},
                        ],
                    },
                ],
            }
        )
        ids = _collect_condition_ids(node)
        assert ids == {"c0", "c1", "c2"}


class TestGroupingTreeRoundTrip:
    def test_save_load_with_tree(self, rules_path: Path) -> None:
        rule_data = {
            "name": "Tree Rule",
            "conditions": [
                {"column_name": "a", "operator": "eq", "filter_value": "1"},
                {"column_name": "b", "operator": "eq", "filter_value": "2"},
            ],
            "condition_relation": "and",
            "grouping_tree": {
                "kind": "and",
                "children": [
                    {"kind": "leaf", "conditionId": "c0"},
                    {"kind": "leaf", "conditionId": "c1"},
                ],
            },
            "logic": {
                "format": "value_vs_column",
                "column_name": "x",
                "operator": "eq",
                "target_value": "y",
            },
        }
        rules_file = RulesFile(version=1, rules=[], next_index=1)
        new_file, _ = create_rule(rules_file, rule_data)
        save_rules(new_file, rules_path)

        loaded = load_rules(rules_path)
        assert loaded.rules[0].grouping_tree is not None
        assert isinstance(loaded.rules[0].grouping_tree, GroupingBranch)
        assert loaded.rules[0].grouping_tree.kind == "and"


class TestMultiValueConditions:
    def test_grouping_tree_replaces_condition_relation(self) -> None:
        data = {
            "name": "Grouped without flat relation",
            "conditions": [
                {"column_name": "a", "operator": "eq", "filter_values": ["1"]},
                {"column_name": "b", "operator": "eq", "filter_values": ["2"]},
            ],
            "grouping_tree": {
                "kind": "and",
                "children": [
                    {"kind": "leaf", "conditionId": "c0"},
                    {"kind": "leaf", "conditionId": "c1"},
                ],
            },
            "logic": {
                "format": "value_vs_column",
                "column_name": "result",
                "operator": "eq",
                "target_value": "ok",
            },
        }
        assert validate_rule(data).valid is True

    def test_multi_values_and_numeric_operator_round_trip(self, rules_path: Path) -> None:
        data = {
            "name": "Numeric alternatives",
            "conditions": [
                {"column_name": "score", "operator": "gt", "filter_values": ["-2.5", "10"]},
            ],
            "logic": {
                "format": "value_vs_column",
                "column_name": "result",
                "operator": "eq",
                "target_value": "ok",
            },
        }
        new_file, _ = create_rule(RulesFile(version=1, rules=[], next_index=1), data)
        save_rules(new_file, rules_path)
        condition = load_rules(rules_path).rules[0].conditions[0]
        assert condition.filter_values == ("-2.5", "10")
        assert condition.filter_value == "-2.5"
