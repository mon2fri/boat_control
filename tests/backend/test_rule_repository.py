import pytest
from apps.rules.models import StoredValidationRule, ValidationRuleIdentity
from apps.rules.repository import (
    CatalogCorruptionError,
    StaleCursorError,
    create_catalog_rule,
    get_catalog_rule,
    list_catalog_rules,
    reorder_enabled_rules,
    set_rule_enabled,
    set_rules_enabled,
    update_catalog_rule,
)


def make_draft(index: int = 0) -> dict:
    return {
        "name": f"Rule {index}",
        "conditions": [{"column_name": "kind", "operator": "eq", "filter_value": str(index)}],
        "logic": {
            "format": "value_vs_column",
            "column_name": "status",
            "operator": "eq",
            "target_value": "active",
        },
    }


@pytest.mark.django_db
def test_create_is_idempotent_by_identity_and_enablement_is_persistent():
    first = create_catalog_rule(make_draft(), enabled=True)
    same_identity = create_catalog_rule({**make_draft(), "name": "renamed"}, enabled=True)
    assert first.rule.rule_id == same_identity.rule.rule_id
    assert first.rule_identifier == same_identity.rule_identifier
    assert ValidationRuleIdentity.objects.count() == 1
    set_rule_enabled(first.rule.rule_id, False)
    assert get_catalog_rule(first.rule.rule_id).enabled is False


@pytest.mark.django_db
def test_business_edit_versions_and_metadata_edit_does_not():
    first = create_catalog_rule(make_draft(), enabled=True)
    metadata = update_catalog_rule(first.rule.rule_id, {**make_draft(), "name": "changed"})
    assert metadata.rule.rule.rule_id == first.rule.rule_id
    changed = update_catalog_rule(first.rule.rule_id, make_draft(2))
    assert changed.previous_rule_id == first.rule.rule_id
    assert changed.rule.rule.rule_id != first.rule.rule_id
    assert get_catalog_rule(first.rule.rule_id).enabled is False
    assert changed.rule.enabled is True


@pytest.mark.django_db
def test_materialization_rejects_payload_identity_corruption():
    row = create_catalog_rule(make_draft()).rule
    StoredValidationRule.objects.filter(rule_id=row.rule_id).update(authored_payload=make_draft(99))
    with pytest.raises(CatalogCorruptionError):
        get_catalog_rule(row.rule_id)


@pytest.mark.django_db
def test_initial_and_keyset_pages_pin_enabled_rules_and_reject_stale_cursor():
    for index in range(55):
        create_catalog_rule(make_draft(index), enabled=False)
    enabled = create_catalog_rule(make_draft(100), enabled=True)
    initial = list_catalog_rules()
    assert enabled.rule.rule_id in {rule.rule.rule_id for rule in initial.rules}
    assert initial.total_count == 56
    assert initial.next_cursor is not None
    page = list_catalog_rules(initial.next_cursor)
    assert len(page.rules) <= 10
    set_rule_enabled(enabled.rule.rule_id, False)
    with pytest.raises(StaleCursorError):
        list_catalog_rules(initial.next_cursor)


@pytest.mark.django_db
def test_bulk_enablement_is_explicit_and_atomic():
    first = create_catalog_rule(make_draft(1), enabled=False)
    second = create_catalog_rule(make_draft(2), enabled=False)
    set_rules_enabled([first.rule.rule_id, second.rule.rule_id])
    assert get_catalog_rule(first.rule.rule_id).enabled
    assert get_catalog_rule(second.rule.rule_id).enabled
    assert not StoredValidationRule.objects.filter(enabled=False, archived_at__isnull=True).exists()


@pytest.mark.django_db
def test_reorder_preserves_catalog_position_and_identity():
    first = create_catalog_rule(make_draft(1), enabled=True)
    second = create_catalog_rule(make_draft(2), enabled=True)
    reordered = reorder_enabled_rules([second.rule.rule_id, first.rule.rule_id])
    assert [item.rule.rule_id for item in reordered] == [second.rule.rule_id, first.rule.rule_id]
    assert [item.rule_identifier for item in reordered] == [
        second.rule_identifier,
        first.rule_identifier,
    ]
    assert (
        get_catalog_rule(first.rule.rule_id).catalog_position
        != get_catalog_rule(second.rule.rule_id).catalog_position
    )
