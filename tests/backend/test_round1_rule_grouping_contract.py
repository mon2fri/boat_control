"""Round 1 Worker A: backend rule catalog/schema/identity contract regressions.

The persisted R079 rule is the reference case: four outcome clauses where a root
OR combines two AND groups. These tests prove the existing API/import/export
surface preserves that expression and its canonical identity without adding a
new schema, and that removing grouping cannot silently become a flat AND.
"""

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
    normalize_rule_draft,
    rule_definition_payload,
    save_rules,
    validate_rule,
)
from django.test import override_settings
from rest_framework.test import APIClient

R079_IDENTIFIER = "CBR1_1FB1N7BHJ3WTCD3BB1KW"

_SERVER_FIELDS = {"rule_id", "rule_identifier", "enabled", "enabled_position"}


def _leaf(index: int) -> dict[str, str]:
    return {"kind": "leaf", "conditionId": f"c{index}"}


def _and(*children: dict[str, object]) -> dict[str, object]:
    return {"kind": "and", "children": list(children)}


def r079_draft() -> dict:
    """The isolated R079-shaped payload; no live catalog/config is read."""

    return {
        "name": "UI Flags - opposite Yes No",
        "description": "Root CSV UI validation: Yes/No, empty and ACDS.",
        "conditions": [],
        "extra_columns": ["sa_flag", "cva_flag", "system", "status", "region"],
        "hide_comparison": False,
        "logic_clauses": [
            {
                "format": "value_vs_column",
                "column_name": "sa_flag",
                "operator": "eq",
                "target_value": "Yes",
                "target_values": [],
                "comparison_mode": "comparison_vs_baseline",
            },
            {
                "format": "value_vs_column",
                "column_name": "cva_flag",
                "operator": "eq",
                "target_value": "No",
                "target_values": [],
                "comparison_mode": "comparison_vs_baseline",
            },
            {
                "format": "value_vs_column",
                "column_name": "sa_flag",
                "operator": "eq",
                "target_value": "No",
                "target_values": [],
                "comparison_mode": "comparison_vs_baseline",
            },
            {
                "format": "value_vs_column",
                "column_name": "cva_flag",
                "operator": "eq",
                "target_value": "Yes",
                "target_values": [],
                "comparison_mode": "comparison_vs_baseline",
            },
        ],
        "logic_relation": "or",
        "logic_grouping_tree": {
            "kind": "or",
            "children": [
                _and(_leaf(0), _leaf(1)),
                _and(_leaf(2), _leaf(3)),
            ],
        },
    }


def r079_tree() -> dict:
    draft = r079_draft()
    tree = draft["logic_grouping_tree"]
    assert isinstance(tree, dict)
    return tree


def _wire(detail: dict) -> dict:
    """Strip server-owned metadata so the payload matches an editor save."""

    return {key: value for key, value in detail.items() if key not in _SERVER_FIELDS}


def _create_r079(client: APIClient) -> dict:
    response = client.post("/api/rules/", r079_draft(), format="json")
    assert response.status_code == 201, response.content
    return response.json()


def test_r079_golden_identity_and_outcome_payload_survive_materialization() -> None:
    draft = r079_draft()
    assert calculate_rule_identifier(draft) == R079_IDENTIFIER

    rules_file, rule = create_rule(
        RulesFile(version=1, rules=[], next_index=1), draft
    )
    payload = rule_definition_payload(rule, include_empty_target_values=True)

    assert payload == draft
    assert "logic" not in payload
    assert len(payload["logic_clauses"]) == 4
    assert payload["logic_relation"] == "or"
    assert payload["logic_grouping_tree"] == r079_tree()
    assert calculate_rule_identifier(payload) == R079_IDENTIFIER
    assert calculate_rule_identifier(rule) == R079_IDENTIFIER


def test_yaml_save_load_and_unchanged_resave_preserve_r079_tree_and_identity(
    tmp_path: Path,
) -> None:
    path = tmp_path / "rules.yaml"
    rules_file, _ = create_rule(
        RulesFile(version=1, rules=[], next_index=1), r079_draft()
    )
    save_rules(rules_file, path)
    loaded = load_rules(path)
    assert len(loaded.rules) == 1

    first_payload = rule_definition_payload(
        loaded.rules[0], include_empty_target_values=True
    )
    assert first_payload["logic_grouping_tree"] == r079_tree()
    assert calculate_rule_identifier(loaded.rules[0]) == R079_IDENTIFIER

    # Saving the loaded rule again must not rewrite the persisted tree.
    resaved_path = tmp_path / "rules-resaved.yaml"
    save_rules(loaded, resaved_path)
    reloaded = load_rules(resaved_path)
    assert (
        rule_definition_payload(reloaded.rules[0], include_empty_target_values=True)
        == first_payload
    )
    assert calculate_rule_identifier(reloaded.rules[0]) == R079_IDENTIFIER


@pytest.mark.django_db
class TestR079CatalogRoundTrip:
    def test_unchanged_catalog_save_retains_identity_rule_id_and_tree(self) -> None:
        client = APIClient()
        created = _create_r079(client)
        assert created["rule_identifier"] == R079_IDENTIFIER
        assert created["rule_id"] == "R001"

        detail = client.get(f"/api/rules/{created['rule_id']}/").json()
        wire = _wire(detail)
        assert calculate_rule_identifier(wire) == R079_IDENTIFIER

        response = client.put(
            f"/api/rules/{created['rule_id']}/", wire, format="json"
        )
        assert response.status_code == 200, response.content
        body = response.json()

        assert body["rule_identifier"] == R079_IDENTIFIER
        assert body["rule_id"] == created["rule_id"]
        assert body["previous_rule_id"] == created["rule_id"]
        assert body["resulting_rule_id"] == created["rule_id"]
        assert body["logic_relation"] == "or"
        assert body["logic_grouping_tree"] == r079_tree()
        assert len(body["logic_clauses"]) == 4

        # An unchanged save is an in-place revision, not a business edit.
        assert StoredValidationRule.objects.count() == 1
        stored = StoredValidationRule.objects.get(rule_id=created["rule_id"])
        assert stored.archived_at is None
        assert stored.identity_id == R079_IDENTIFIER

        reread = client.get(f"/api/rules/{created['rule_id']}/").json()
        assert reread["rule_identifier"] == R079_IDENTIFIER
        assert reread["logic_grouping_tree"] == r079_tree()

    def test_export_import_round_trip_preserves_tree_and_bijects_identity(
        self, tmp_path: Path
    ) -> None:
        client = APIClient()
        created = _create_r079(client)

        with override_settings(RULES_CONFIG_DIR=tmp_path):
            exported = client.post(
                "/api/rules/configs/", {"name": "r079-contract"}, format="json"
            )
            assert exported.status_code == 201, exported.content
            content = exported.json()["content"]
            again = client.post(
                "/api/rules/configs/", {"name": "r079-contract-2"}, format="json"
            )
            assert again.status_code == 201, again.content

        assert again.json()["content"] == content
        assert content[0]["rule_identifier"] == R079_IDENTIFIER
        assert content[0]["logic_relation"] == "or"
        assert content[0]["logic_grouping_tree"] == r079_tree()
        assert len(content[0]["logic_clauses"]) == 4

        imported = client.post(
            "/api/rules/configs/import/", {"content": content}, format="json"
        )
        assert imported.status_code == 200, imported.content
        assert imported.json()["reused"] == 1
        assert (
            imported.json()["bindings"][created["rule_id"]] == R079_IDENTIFIER
        )

        detail = client.get(f"/api/rules/{created['rule_id']}/").json()
        assert detail["rule_identifier"] == R079_IDENTIFIER
        assert detail["logic_grouping_tree"] == r079_tree()

    def test_rejected_grouping_removal_leaves_persisted_rule_intact(self) -> None:
        client = APIClient()
        created = _create_r079(client)
        revision = RuleStoreState.objects.get(singleton_key=1).revision

        removed = r079_draft()
        removed.pop("logic_relation")
        removed.pop("logic_grouping_tree")

        response = client.put(
            f"/api/rules/{created['rule_id']}/", removed, format="json"
        )
        assert response.status_code == 400
        assert "logic_relation is required when there are 2+ logic clauses" in (
            response.json()["error"]
        )

        # No silent AND fallback, no archive/replacement, no partial write.
        state = RuleStoreState.objects.get(singleton_key=1)
        assert state.revision == revision
        assert StoredValidationRule.objects.count() == 1
        stored = StoredValidationRule.objects.get(rule_id=created["rule_id"])
        assert stored.archived_at is None
        assert stored.identity_id == R079_IDENTIFIER
        detail = client.get(f"/api/rules/{created['rule_id']}/").json()
        assert detail["logic_grouping_tree"] == r079_tree()

    def test_import_rejects_missing_grouping_transactionally(self) -> None:
        client = APIClient()
        created = _create_r079(client)
        revision = RuleStoreState.objects.get(singleton_key=1).revision

        missing = r079_draft()
        missing.pop("logic_relation")
        missing.pop("logic_grouping_tree")
        response = client.post(
            "/api/rules/configs/import/", {"rules": [missing]}, format="json"
        )
        assert response.status_code == 400
        error = response.json()["error"]
        assert "UI Flags - opposite Yes No" in error
        assert "logic_relation is required" in error
        assert RuleStoreState.objects.get(singleton_key=1).revision == revision
        assert StoredValidationRule.objects.count() == 1
        assert (
            get_catalog_rule(created["rule_id"]).rule_identifier == R079_IDENTIFIER
        )

    def test_import_reports_tree_validation_error_when_identity_is_uncomputable(
        self,
    ) -> None:
        client = APIClient()
        _create_r079(client)
        revision = RuleStoreState.objects.get(singleton_key=1).revision

        malformed = r079_draft()
        malformed["logic_grouping_tree"] = {
            "kind": "xor",
            "children": [_leaf(0), _leaf(1)],
        }
        response = client.post(
            "/api/rules/configs/import/", {"rules": [malformed]}, format="json"
        )
        assert response.status_code == 400
        error = response.json()["error"]
        assert "Invalid logic_grouping_tree structure" in error
        assert "Invalid outcome grouping operator" not in error
        assert RuleStoreState.objects.get(singleton_key=1).revision == revision


class TestGroupingValidationContract:
    def test_multi_clause_without_relation_or_tree_is_rejected_not_defaulted_and(
        self,
    ) -> None:
        draft = r079_draft()
        draft.pop("logic_relation")
        draft.pop("logic_grouping_tree")

        result = validate_rule(draft)
        assert result.valid is False
        assert any(
            "logic_relation is required when there are 2+ logic clauses" in error
            for error in result.errors
        )

        # Normalization has no implicit AND branch and keeps every clause.
        normalized = normalize_rule_draft(draft)
        assert "logic_relation" not in normalized
        assert "logic_grouping_tree" not in normalized
        assert len(normalized["logic_clauses"]) == 4

    def test_tree_that_omits_a_clause_is_rejected(self) -> None:
        draft = r079_draft()
        draft["logic_grouping_tree"] = {
            "kind": "and",
            "children": [_leaf(0), _leaf(1)],
        }
        result = validate_rule(draft)
        assert result.valid is False
        assert any(
            "logic_grouping_tree omits conditions: c2, c3" in error
            for error in result.errors
        )

    def test_tree_reference_out_of_range_is_rejected(self) -> None:
        draft = r079_draft()
        draft["logic_grouping_tree"] = {
            "kind": "or",
            "children": [
                _and(_leaf(0), _leaf(1)),
                _and(_leaf(2), _leaf(4)),
            ],
        }
        result = validate_rule(draft)
        assert result.valid is False
        assert any("non-existent condition" in error for error in result.errors)

    def test_removing_tree_is_an_explicit_flat_relation_not_an_and_fallback(
        self,
    ) -> None:
        draft = r079_draft()
        draft.pop("logic_grouping_tree")
        assert validate_rule(draft).valid is True

        rules_file, rule = create_rule(
            RulesFile(version=1, rules=[], next_index=1), draft
        )
        payload = rule_definition_payload(rule)
        assert "logic_grouping_tree" not in payload
        assert payload["logic_relation"] == "or"
        assert rule.outcome_expression.flat_relation == "or"
        assert rule.outcome_expression.grouping_tree is None
        assert calculate_rule_identifier(rule) != R079_IDENTIFIER


@pytest.mark.django_db
class TestLegacySingleOutcomeRemainsSupported:
    def test_legacy_single_unchanged_save_and_export_import_keep_legacy_shape(
        self, tmp_path: Path
    ) -> None:
        draft = {
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
        client = APIClient()
        created = client.post("/api/rules/", draft, format="json")
        assert created.status_code == 201, created.content
        created_body = created.json()
        identifier = created_body["rule_identifier"]

        detail = client.get(f"/api/rules/{created_body['rule_id']}/").json()
        response = client.put(
            f"/api/rules/{created_body['rule_id']}/", _wire(detail), format="json"
        )
        assert response.status_code == 200, response.content
        body = response.json()
        assert body["rule_identifier"] == identifier
        assert body["resulting_rule_id"] == created_body["rule_id"]
        assert "logic" in body
        assert "logic_clauses" not in body
        assert "logic_grouping_tree" not in body

        with override_settings(RULES_CONFIG_DIR=tmp_path):
            exported = client.post(
                "/api/rules/configs/", {"name": "legacy-contract"}, format="json"
            )
        assert exported.status_code == 201, exported.content
        content = exported.json()["content"]
        assert content[0]["rule_identifier"] == identifier
        assert "logic" in content[0]
        assert "logic_clauses" not in content[0]
        assert "logic_relation" not in content[0]
        assert "logic_grouping_tree" not in content[0]

        imported = client.post(
            "/api/rules/configs/import/", {"rules": content}, format="json"
        )
        assert imported.status_code == 200, imported.content
        assert imported.json()["reused"] == 1
        assert imported.json()["bindings"][created_body["rule_id"]] == identifier


@pytest.mark.django_db
def test_existing_api_accepts_validated_r079_repository_payload() -> None:
    """The repository/pure path and the API share one validation policy."""

    snapshot = create_catalog_rule(r079_draft(), enabled=False)
    assert snapshot.rule_identifier == R079_IDENTIFIER
    assert snapshot.rule.outcome_expression.representation == "clauses"
    assert snapshot.rule.outcome_expression.relation == "or"
    assert snapshot.rule.outcome_expression.grouping_tree is not None
