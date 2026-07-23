from __future__ import annotations

from pathlib import Path

import yaml
from apps.families.resolver import (
    available_members,
    evaluate_family_predicate,
    evaluate_rule_predicate_for_family,
    expand_column_references,
    is_selectable,
    missing_members,
)
from django.test.utils import override_settings


def _setup_families(tmp_path: Path) -> Path:
    families_dir = tmp_path / "families"
    families_dir.mkdir(parents=True)

    contact = {
        "kind": "column",
        "name": "Contact",
        "columns": ["email", "phone", "fax"],
        "_version": 1,
    }
    (families_dir / "Contact.yaml").write_text(yaml.safe_dump(contact))

    location = {
        "kind": "column",
        "name": "Location",
        "columns": ["city", "state", "zip"],
        "_version": 1,
    }
    (families_dir / "Location.yaml").write_text(yaml.safe_dump(location))

    return families_dir


class TestAvailableMembers:
    def test_all_members_available(self, tmp_path: Path) -> None:
        families_dir = _setup_families(tmp_path)
        eligible = {"email", "phone", "fax", "city"}
        with override_settings(FAMILY_CONFIG_DIR=families_dir):
            members = available_members("Contact", eligible)
        assert sorted(members) == ["email", "fax", "phone"]

    def test_partial_members_available(self, tmp_path: Path) -> None:
        families_dir = _setup_families(tmp_path)
        eligible = {"email", "city"}
        with override_settings(FAMILY_CONFIG_DIR=families_dir):
            members = available_members("Contact", eligible)
        assert members == ["email"]

    def test_no_members_available(self, tmp_path: Path) -> None:
        families_dir = _setup_families(tmp_path)
        eligible = {"city", "state"}
        with override_settings(FAMILY_CONFIG_DIR=families_dir):
            members = available_members("Contact", eligible)
        assert members == []

    def test_nonexistent_family(self, tmp_path: Path) -> None:
        families_dir = _setup_families(tmp_path)
        eligible = {"email"}
        with override_settings(FAMILY_CONFIG_DIR=families_dir):
            members = available_members("NonExistent", eligible)
        assert members == []


class TestMissingMembers:
    def test_some_missing(self, tmp_path: Path) -> None:
        families_dir = _setup_families(tmp_path)
        eligible = {"email"}
        with override_settings(FAMILY_CONFIG_DIR=families_dir):
            missing = missing_members("Contact", eligible)
        assert sorted(missing) == ["fax", "phone"]

    def test_none_missing(self, tmp_path: Path) -> None:
        families_dir = _setup_families(tmp_path)
        eligible = {"email", "phone", "fax"}
        with override_settings(FAMILY_CONFIG_DIR=families_dir):
            missing = missing_members("Contact", eligible)
        assert missing == []


class TestIsSelectable:
    def test_selectable(self, tmp_path: Path) -> None:
        families_dir = _setup_families(tmp_path)
        eligible = {"email"}
        with override_settings(FAMILY_CONFIG_DIR=families_dir):
            assert is_selectable("Contact", eligible) is True

    def test_not_selectable(self, tmp_path: Path) -> None:
        families_dir = _setup_families(tmp_path)
        eligible = {"city"}
        with override_settings(FAMILY_CONFIG_DIR=families_dir):
            assert is_selectable("Contact", eligible) is False


class TestExpandColumnReferences:
    def test_direct_columns_pass_through(self, tmp_path: Path) -> None:
        families_dir = _setup_families(tmp_path)
        eligible = {"email", "phone", "city"}
        with override_settings(FAMILY_CONFIG_DIR=families_dir):
            effective, resolved, zero = expand_column_references(
                ["city", "email"], eligible
            )
        assert effective == ["city", "email"]
        assert resolved == []
        assert zero == []

    def test_family_expands_to_members(self, tmp_path: Path) -> None:
        families_dir = _setup_families(tmp_path)
        eligible = {"email", "phone", "city"}
        with override_settings(FAMILY_CONFIG_DIR=families_dir):
            effective, resolved, zero = expand_column_references(
                ["family:Contact", "city"], eligible
            )
        assert effective == ["email", "phone", "city"]
        assert resolved == ["Contact"]
        assert zero == []

    def test_family_with_no_members_reported(self, tmp_path: Path) -> None:
        families_dir = _setup_families(tmp_path)
        eligible = {"city"}
        with override_settings(FAMILY_CONFIG_DIR=families_dir):
            effective, resolved, zero = expand_column_references(
                ["family:Contact", "city"], eligible
            )
        assert effective == ["city"]
        assert resolved == []
        assert zero == ["Contact"]

    def test_deduplicates_expanded_columns(self, tmp_path: Path) -> None:
        families_dir = _setup_families(tmp_path)
        eligible = {"email", "phone", "city"}
        with override_settings(FAMILY_CONFIG_DIR=families_dir):
            effective, resolved, zero = expand_column_references(
                ["family:Contact", "email", "phone"], eligible
            )
        # email and phone appear from family expansion, but we also have them
        # as direct — they should be deduped
        assert effective == ["email", "phone"]
        assert resolved == ["Contact"]
        assert zero == []


class TestEvaluateFamilyPredicate:
    def test_eq_any_member_matches(self) -> None:
        result = evaluate_family_predicate("abc", "eq", ["abc", "def"])
        assert result is True

    def test_eq_none_match(self) -> None:
        result = evaluate_family_predicate("xyz", "eq", ["abc", "def"])
        assert result is False

    def test_neq_all_must_pass(self) -> None:
        result = evaluate_family_predicate("xyz", "neq", ["abc", "def"])
        assert result is True

    def test_neq_one_matches(self) -> None:
        result = evaluate_family_predicate("abc", "neq", ["abc", "def"])
        assert result is False

    def test_contains_any(self) -> None:
        result = evaluate_family_predicate("testing", "contains", ["test", "xyz"])
        assert result is True

    def test_contains_none(self) -> None:
        result = evaluate_family_predicate("hello", "contains", ["test", "xyz"])
        assert result is False

    def test_ncontains_all_pass(self) -> None:
        result = evaluate_family_predicate("hello", "ncontains", ["test", "xyz"])
        assert result is True

    def test_ncontains_one_fails(self) -> None:
        result = evaluate_family_predicate("testing", "ncontains", ["test", "xyz"])
        assert result is False


class TestEvaluateRulePredicateForFamily:
    def test_positive_any_member_matches(self, tmp_path: Path) -> None:
        families_dir = _setup_families(tmp_path)
        eligible = {"email", "phone"}
        row = {"email": "a@b.com", "phone": "555-0100"}
        with override_settings(FAMILY_CONFIG_DIR=families_dir):
            is_violation, col, val = evaluate_rule_predicate_for_family(
                row, "Contact", "eq", ["a@b.com"], eligible,
            )
        assert is_violation is False

    def test_positive_no_member_matches(self, tmp_path: Path) -> None:
        families_dir = _setup_families(tmp_path)
        eligible = {"email", "phone"}
        row = {"email": "x@y.com", "phone": "555-0100"}
        with override_settings(FAMILY_CONFIG_DIR=families_dir):
            is_violation, col, val = evaluate_rule_predicate_for_family(
                row, "Contact", "eq", ["a@b.com"], eligible,
            )
        assert is_violation is True

    def test_negative_all_members_must_pass(self, tmp_path: Path) -> None:
        families_dir = _setup_families(tmp_path)
        eligible = {"email", "phone"}
        row = {"email": "x@y.com", "phone": "555-0100"}
        with override_settings(FAMILY_CONFIG_DIR=families_dir):
            is_violation, col, val = evaluate_rule_predicate_for_family(
                row, "Contact", "neq", ["a@b.com"], eligible,
            )
        assert is_violation is False

    def test_negative_one_member_fails(self, tmp_path: Path) -> None:
        families_dir = _setup_families(tmp_path)
        eligible = {"email", "phone"}
        row = {"email": "a@b.com", "phone": "555-0100"}
        with override_settings(FAMILY_CONFIG_DIR=families_dir):
            is_violation, col, val = evaluate_rule_predicate_for_family(
                row, "Contact", "neq", ["a@b.com"], eligible,
            )
        assert is_violation is True

    def test_column_vs_column_both_families(self, tmp_path: Path) -> None:
        families_dir = _setup_families(tmp_path)
        # Contact = [email, phone, fax], Location = [city, state, zip]
        eligible = {"email", "phone", "city", "state"}
        row = {"email": "a@b.com", "phone": "555-0000"}
        baseline_row = {"email": "a@b.com", "phone": "555-1111"}
        with override_settings(FAMILY_CONFIG_DIR=families_dir):
            # Compare Contact against Contact (same family, compare email vs email, phone vs phone)
            is_violation, col, val = evaluate_rule_predicate_for_family(
                row, "Contact", "eq", [], eligible,
                baseline_row=baseline_row,
                logic_format="column_vs_column",
                target_column="family:Contact",
            )
        # email matches, phone doesn't: with eq (positive), any member matching = pass
        assert is_violation is False

    def test_column_vs_column_both_families_all_differ(self, tmp_path: Path) -> None:
        families_dir = _setup_families(tmp_path)
        eligible = {"email", "phone"}
        row = {"email": "x@y.com", "phone": "555-9999"}
        baseline_row = {"email": "a@b.com", "phone": "555-0000"}
        with override_settings(FAMILY_CONFIG_DIR=families_dir):
            is_violation, col, val = evaluate_rule_predicate_for_family(
                row, "Contact", "eq", [], eligible,
                baseline_row=baseline_row,
                logic_format="column_vs_column",
                target_column="family:Contact",
            )
        assert is_violation is True

    def test_column_vs_column_no_shared_members(self, tmp_path: Path) -> None:
        families_dir = _setup_families(tmp_path)
        eligible = {"email", "phone", "city", "state"}
        row = {"email": "a@b.com"}
        baseline_row = {"city": "NYC"}
        with override_settings(FAMILY_CONFIG_DIR=families_dir):
            is_violation, col, val = evaluate_rule_predicate_for_family(
                row, "Contact", "eq", [], eligible,
                baseline_row=baseline_row,
                logic_format="column_vs_column",
                target_column="family:Location",
            )
        # Contact and Location have no shared member names
        assert is_violation is True
