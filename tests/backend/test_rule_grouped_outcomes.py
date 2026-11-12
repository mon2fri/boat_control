from __future__ import annotations

from pathlib import Path

import pytest
from apps.rules.identifiers import calculate_rule_identifier
from apps.rules.models import RuleStoreState, StoredValidationRule
from apps.rules.repository import create_catalog_rule, get_catalog_rule
from apps.rules.services import (
    RulesFile,
    create_rule,
    load_rules,
    rule_definition_payload,
    save_rules,
    validate_rule,
)
from django.test import override_settings
from rest_framework.test import APIClient


def legacy_single() -> dict:
    return {
        "name": "Legacy single",
        "description": "single outcome",
        "conditions": [],
        "logic": {
            "format": "value_vs_column",
            "column_name": "status",
            "operator": "eq",
            "target_value": "active",
        },
    }


def new_single() -> dict:
    return {
        "name": "New single",
        "logic_clauses": [
            {
                "format": "value_vs_column",
                "column_name": "status",
                "operator": "eq",
                "target_value": "active",
            }
        ],
    }


def multi_two() -> dict:
    return {
        "name": "SA flags",
        "description": "two grouped outcomes",
        "logic_clauses": [
            {
                "format": "value_vs_column",
                "column_name": "SA_CONTRIBUTORY",
                "operator": "eq",
                "target_value": "Y",
            },
            {
                "format": "value_vs_column",
                "column_name": "SA_CVA_HEDGE_BOOK",
                "operator": "eq",
                "target_value": "N",
            },
        ],
        "logic_relation": "and",
    }


def multi_four_with_tree() -> dict:
    return {
        "name": "Mutually exclusive flags",
        "conditions": [
            {"column_name": "STATUS", "operator": "eq", "filter_value": "Active"},
        ],
        "logic_clauses": [
            {
                "format": "value_vs_column",
                "column_name": "SA_CONTRIBUTORY",
                "operator": "eq",
                "target_value": "Y",
            },
            {
                "format": "value_vs_column",
                "column_name": "SA_CVA_HEDGE_BOOK",
                "operator": "eq",
                "target_value": "N",
            },
            {
                "format": "value_vs_column",
                "column_name": "SA_CONTRIBUTORY",
                "operator": "eq",
                "target_value": "N",
            },
            {
                "format": "value_vs_column",
                "column_name": "SA_CVA_HEDGE_BOOK",
                "operator": "eq",
                "target_value": "Y",
            },
        ],
        "logic_grouping_tree": {
            "kind": "or",
            "children": [
                {
                    "kind": "and",
                    "children": [
                        {"kind": "leaf", "conditionId": "c0"},
                        {"kind": "leaf", "conditionId": "c1"},
                    ],
                },
                {
                    "kind": "and",
                    "children": [
                        {"kind": "leaf", "conditionId": "c2"},
                        {"kind": "leaf", "conditionId": "c3"},
                    ],
                },
            ],
        },
    }


class TestLegacyIdentityCompatibility:
    def test_golden_legacy_identifiers_are_unchanged(self) -> None:
        conditions = {
            "name": "conditions",
            "conditions": [
                {"column_name": "name", "operator": "eq", "filter_value": "john"},
                {"column_name": "region", "operator": "eq", "filter_value": "east"},
            ],
            "condition_relation": "and",
            "logic": {
                "format": "value_vs_column",
                "column_name": "status",
                "operator": "eq",
                "target_value": "active",
            },
        }
        grouped_conditions = {
            "name": "tree",
            "conditions": [
                {"column_name": "a", "operator": "eq", "filter_value": "1"},
                {"column_name": "b", "operator": "eq", "filter_value": "2"},
                {"column_name": "c", "operator": "eq", "filter_value": "3"},
            ],
            "grouping_tree": {
                "kind": "and",
                "children": [
                    {"kind": "leaf", "conditionId": "c0"},
                    {
                        "kind": "or",
                        "children": [
                            {"kind": "leaf", "conditionId": "c1"},
                            {"kind": "leaf", "conditionId": "c2"},
                        ],
                    },
                ],
            },
            "logic": {
                "format": "value_vs_column",
                "column_name": "x",
                "operator": "contains",
                "target_value": "ok",
            },
        }
        column_vs_column = {
            "name": "cvc",
            "conditions": [],
            "logic": {
                "format": "column_vs_column",
                "column_name": "status",
                "operator": "eq",
                "target_value": "expected",
                "comparison_mode": "comparison_vs_comparison",
            },
        }
        assert calculate_rule_identifier(legacy_single()) == "CBR1_0Z100ERCHKBF4R1AGQ5T"
        assert calculate_rule_identifier(conditions) == "CBR1_1ZZZBPWM3GV5GYBEZTFY"
        assert calculate_rule_identifier(grouped_conditions) == "CBR1_1Q74WFS2TQVQATPSCT3W"
        assert calculate_rule_identifier(column_vs_column) == "CBR1_18177K2GPAP0C50JZVPS"

    def test_new_single_form_has_legacy_identity_and_storage(self) -> None:
        legacy_id = calculate_rule_identifier(legacy_single())
        assert calculate_rule_identifier(new_single()) == legacy_id

        _, rule = create_rule(RulesFile(version=1, rules=[], next_index=1), new_single())
        assert rule.logic_clauses == ()
        assert rule.outcome_expression.is_single is True
        assert calculate_rule_identifier(rule) == legacy_id
        payload = rule_definition_payload(rule)
        assert "logic" in payload
        assert "logic_clauses" not in payload

    def test_single_column_comparison_remains_usable(self) -> None:
        draft = {
            "name": "Column comparison",
            "logic": {
                "format": "column_vs_column",
                "column_name": "current_status",
                "operator": "neq",
                "target_value": "previous_status",
                "comparison_mode": "comparison_vs_baseline",
            },
        }
        assert validate_rule(draft).valid is True
        _, rule = create_rule(RulesFile(version=1, rules=[], next_index=1), draft)
        assert rule.logic.format == "column_vs_column"
        assert calculate_rule_identifier(rule) == calculate_rule_identifier(draft)


class TestOutcomeIdentity:
    def test_reordered_flat_and_tree_children_are_equivalent(self) -> None:
        flat = multi_two()
        reordered = {
            **flat,
            "logic_clauses": list(reversed(flat["logic_clauses"])),
        }
        assert calculate_rule_identifier(flat) == calculate_rule_identifier(reordered)

        tree = multi_four_with_tree()
        reordered_tree = {
            **tree,
            "logic_clauses": [
                tree["logic_clauses"][2],
                tree["logic_clauses"][3],
                tree["logic_clauses"][0],
                tree["logic_clauses"][1],
            ],
            "logic_grouping_tree": {
                "kind": "or",
                "children": [
                    {
                        "kind": "and",
                        "children": [
                            {"kind": "leaf", "conditionId": "c0"},
                            {"kind": "leaf", "conditionId": "c1"},
                        ],
                    },
                    {
                        "kind": "and",
                        "children": [
                            {"kind": "leaf", "conditionId": "c2"},
                            {"kind": "leaf", "conditionId": "c3"},
                        ],
                    },
                ],
            },
        }
        assert calculate_rule_identifier(tree) == calculate_rule_identifier(reordered_tree)

    def test_changed_outcome_values_relation_and_grouping_change_identity(self) -> None:
        base = calculate_rule_identifier(multi_two())
        changed_value = multi_two()
        changed_value["logic_clauses"][0]["target_value"] = "N"
        assert calculate_rule_identifier(changed_value) != base

        changed_relation = multi_two()
        changed_relation["logic_relation"] = "or"
        assert calculate_rule_identifier(changed_relation) != base

        changed_group = multi_four_with_tree()
        changed_group["logic_grouping_tree"] = {
            "kind": "and",
            "children": [
                {
                    "kind": "or",
                    "children": [
                        {"kind": "leaf", "conditionId": "c0"},
                        {"kind": "leaf", "conditionId": "c1"},
                    ],
                },
                {
                    "kind": "or",
                    "children": [
                        {"kind": "leaf", "conditionId": "c2"},
                        {"kind": "leaf", "conditionId": "c3"},
                    ],
                },
            ],
        }
        assert calculate_rule_identifier(changed_group) != calculate_rule_identifier(
            multi_four_with_tree()
        )


class TestOutcomeValidation:
    def test_both_forms_are_rejected(self) -> None:
        draft = multi_two()
        draft["logic"] = legacy_single()["logic"]
        result = validate_rule(draft)
        assert result.valid is False
        assert any("not both" in error for error in result.errors)

    def test_multiple_clauses_require_relation_or_tree(self) -> None:
        draft = multi_two()
        draft.pop("logic_relation")
        result = validate_rule(draft)
        assert result.valid is False
        assert any("logic_relation is required" in error for error in result.errors)

    def test_multi_outcome_rejects_column_vs_column(self) -> None:
        draft = multi_two()
        draft["logic_clauses"][1]["format"] = "column_vs_column"
        result = validate_rule(draft)
        assert result.valid is False
        assert any("value_vs_column only" in error for error in result.errors)

    @pytest.mark.parametrize(
        "tree",
        [
            {"kind": "xor", "children": []},
            {"kind": "and", "children": []},
            {
                "kind": "and",
                "children": [
                    {"kind": "leaf", "conditionId": "c0"},
                    {"kind": "leaf", "conditionId": "c0"},
                ],
            },
            {
                "kind": "and",
                "children": [
                    {"kind": "leaf", "conditionId": "c0"},
                    {"kind": "leaf", "conditionId": "c9"},
                ],
            },
            {
                "kind": "and",
                "children": [
                    {"kind": "leaf", "conditionId": "c0"},
                ],
            },
        ],
    )
    def test_malformed_duplicate_unknown_omitted_and_empty_trees_are_rejected(
        self, tree: dict
    ) -> None:
        draft = multi_two()
        draft["logic_grouping_tree"] = tree
        result = validate_rule(draft)
        assert result.valid is False

    def test_tree_depth_is_bounded(self) -> None:
        node: dict = {"kind": "leaf", "conditionId": "c0"}
        for _ in range(40):
            node = {"kind": "and", "children": [node, {"kind": "leaf", "conditionId": "c1"}]}
        draft = multi_two()
        draft["logic_grouping_tree"] = node
        result = validate_rule(draft)
        assert result.valid is False
        assert any("depth" in error for error in result.errors)

    def test_valid_tree_covering_every_clause(self) -> None:
        assert validate_rule(multi_four_with_tree()).valid is True


class TestYamlRoundTrip:
    def test_multi_outcome_tree_round_trips(self, tmp_path: Path) -> None:
        path = tmp_path / "rules.yaml"
        draft = multi_four_with_tree()
        rules_file, _ = create_rule(RulesFile(version=1, rules=[], next_index=1), draft)
        save_rules(rules_file, path)

        loaded = load_rules(path)
        rule = loaded.rules[0]
        assert rule.outcome_expression.representation == "clauses"
        assert len(rule.outcome_expression.clauses) == 4
        assert rule.outcome_expression.grouping_tree is not None
        assert rule_definition_payload(rule) == rule_definition_payload(rules_file.rules[0])
        assert calculate_rule_identifier(rule) == calculate_rule_identifier(draft)

    def test_legacy_single_round_trips_without_new_fields(self, tmp_path: Path) -> None:
        path = tmp_path / "rules.yaml"
        rules_file, _ = create_rule(
            RulesFile(version=1, rules=[], next_index=1), legacy_single()
        )
        save_rules(rules_file, path)
        loaded = load_rules(path)
        payload = rule_definition_payload(loaded.rules[0])
        assert "logic" in payload
        assert "logic_clauses" not in payload
        assert calculate_rule_identifier(loaded.rules[0]) == "CBR1_0Z100ERCHKBF4R1AGQ5T"


@pytest.mark.django_db
class TestCatalogAndConfigRoundTrip:
    def test_catalog_response_keeps_complete_outcome_expression(self) -> None:
        client = APIClient()
        created = client.post("/api/rules/", multi_four_with_tree(), format="json")
        assert created.status_code == 201, created.content
        body = created.json()
        assert "logic" not in body
        assert len(body["logic_clauses"]) == 4
        assert body["logic_grouping_tree"] == multi_four_with_tree()["logic_grouping_tree"]
        assert body["rule_identifier"] == calculate_rule_identifier(multi_four_with_tree())

        detail = client.get(f"/api/rules/{body['rule_id']}/").json()
        assert detail["logic_clauses"] == body["logic_clauses"]
        assert detail["logic_grouping_tree"] == body["logic_grouping_tree"]

    def test_export_import_reuses_identity_and_preserves_tree(self, tmp_path: Path) -> None:
        client = APIClient()
        created = client.post("/api/rules/", multi_four_with_tree(), format="json").json()
        with override_settings(RULES_CONFIG_DIR=tmp_path):
            exported = client.post(
                "/api/rules/configs/", {"name": "grouped-outcomes"}, format="json"
            )
        assert exported.status_code == 201, exported.content
        content = exported.json()["content"]
        assert content[0]["rule_identifier"] == created["rule_identifier"]
        assert len(content[0]["logic_clauses"]) == 4
        assert content[0]["logic_grouping_tree"] == multi_four_with_tree()["logic_grouping_tree"]

        imported = client.post(
            "/api/rules/configs/import/", {"rules": content}, format="json"
        )
        assert imported.status_code == 200, imported.content
        assert imported.json()["reused"] == 1
        assert imported.json()["bindings"][created["rule_id"]] == created["rule_identifier"]

    def test_invalid_grouped_import_is_transactional(self) -> None:
        client = APIClient()
        created = client.post("/api/rules/", multi_two(), format="json").json()
        revision = RuleStoreState.objects.get(singleton_key=1).revision

        invalid = multi_two()
        invalid["logic_grouping_tree"] = {
            "kind": "and",
            "children": [
                {"kind": "leaf", "conditionId": "c0"},
                {"kind": "leaf", "conditionId": "c0"},
            ],
        }
        response = client.post("/api/rules/configs/import/", {"rules": [invalid]}, format="json")
        assert response.status_code == 400
        assert RuleStoreState.objects.get(singleton_key=1).revision == revision
        assert get_catalog_rule(created["rule_id"]).enabled is True
        assert StoredValidationRule.objects.filter(archived_at__isnull=True).count() == 1

    def test_duplicate_grouped_rule_returns_equivalent_hint(self) -> None:
        client = APIClient()
        first = client.post("/api/rules/", multi_two(), format="json").json()
        duplicate_payload = {**multi_two(), "name": "Same logic new label"}
        duplicate = client.post("/api/rules/", duplicate_payload, format="json")

        assert duplicate.status_code == 201, duplicate.content
        assert duplicate.json()["rule_id"] == first["rule_id"]
        assert duplicate.json()["equivalent_rule"] is True
        assert duplicate.json()["equivalent_rule_id"] == first["rule_id"]
        assert client.get(f"/api/rules/{first['rule_id']}/").json()["name"] == "SA flags"

    def test_changed_grouped_outcome_uses_business_edit_lifecycle(self) -> None:
        client = APIClient()
        original = client.post("/api/rules/", multi_two(), format="json").json()
        changed = multi_two()
        changed["logic_clauses"][0]["target_value"] = "N"

        response = client.put(
            f"/api/rules/{original['rule_id']}/", changed, format="json"
        )
        assert response.status_code == 200, response.content
        body = response.json()
        assert body["resulting_rule_id"] != original["rule_id"]
        assert body["rule_identifier"] != original["rule_identifier"]
        assert body["enabled"] is True
        previous = StoredValidationRule.objects.get(rule_id=original["rule_id"])
        assert previous.archived_at is not None
        assert StoredValidationRule.objects.get(rule_id=body["resulting_rule_id"]).enabled is True

    def test_multi_outcome_column_vs_column_is_rejected_by_api(self) -> None:
        draft = multi_two()
        draft["logic_clauses"][1]["format"] = "column_vs_column"
        response = APIClient().post("/api/rules/", draft, format="json")
        assert response.status_code == 400
        assert "value_vs_column only" in response.json()["error"]

    def test_repository_materializes_grouped_payload(self) -> None:
        snapshot = create_catalog_rule(multi_four_with_tree())
        assert len(snapshot.rule.outcome_expression.clauses) == 4
        assert snapshot.rule.outcome_expression.grouping_tree is not None
        assert get_catalog_rule(snapshot.rule.rule_id).rule_identifier == snapshot.rule_identifier
