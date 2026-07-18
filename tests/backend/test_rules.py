from pathlib import Path

import pytest
from apps.rules.services import (
    RulesFile,
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
