from apps.rules.identifiers import (
    calculate_rule_identifier,
    canonicalize_rule,
    serialize_canonical_rule,
)


def draft(**changes):
    value = {
        "rule_id": "R001",
        "name": "display name",
        "description": "display description",
        "conditions": [
            {"id": "c0", "column_name": "name", "operator": "eq", "filter_value": "john"},
            {"id": "c1", "column_name": "region", "operator": "eq", "filter_value": "east"},
        ],
        "condition_relation": "and",
        "logic": {
            "format": "value_vs_column",
            "column_name": "status",
            "operator": "eq",
            "target_value": "active",
        },
        "extra_columns": ["debug"],
        "hide_comparison": True,
    }
    value.update(changes)
    return value


def test_requirement_order_and_group_examples_have_stable_ids():
    first = draft()
    reordered = draft(
        conditions=[first["conditions"][1], first["conditions"][0]],
        condition_relation="and",
    )
    assert calculate_rule_identifier(first) == calculate_rule_identifier(reordered)

    grouped = draft(
        conditions=[
            {"column_name": "name", "operator": "eq", "filter_value": "john"},
            {"column_name": "region", "operator": "eq", "filter_value": "west"},
            {"column_name": "name", "operator": "eq", "filter_value": "zoe"},
            {"column_name": "region", "operator": "eq", "filter_value": "east"},
        ],
        grouping_tree={
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
    )
    grouped_reordered = draft(
        conditions=[
            grouped["conditions"][2],
            grouped["conditions"][3],
            grouped["conditions"][0],
            grouped["conditions"][1],
        ],
        grouping_tree={
            "kind": "or",
            "children": [
                {
                    "kind": "and",
                    "children": [
                        {"kind": "leaf", "conditionId": "c2"},
                        {"kind": "leaf", "conditionId": "c3"},
                    ],
                },
                {
                    "kind": "and",
                    "children": [
                        {"kind": "leaf", "conditionId": "c0"},
                        {"kind": "leaf", "conditionId": "c1"},
                    ],
                },
            ],
        },
    )
    assert calculate_rule_identifier(grouped) == calculate_rule_identifier(grouped_reordered)


def test_canonicalizer_is_conservative_and_exact():
    redundant = draft(
        conditions=[
            {"column_name": "score", "operator": "gt", "filter_value": "10"},
            {"column_name": "score", "operator": "gt", "filter_value": "20"},
        ]
    )
    simple = draft(conditions=[{"column_name": "score", "operator": "gt", "filter_value": "20"}])
    assert calculate_rule_identifier(redundant) != calculate_rule_identifier(simple)

    duplicate = draft(conditions=[draft()["conditions"][0], draft()["conditions"][0]])
    assert calculate_rule_identifier(duplicate) != calculate_rule_identifier(simple)
    assert calculate_rule_identifier(draft()) != calculate_rule_identifier(
        draft(
            conditions=[
                draft()["conditions"][0],
                {**draft()["conditions"][1], "filter_value": " east"},
            ]
        )
    )
    assert calculate_rule_identifier(draft()) != calculate_rule_identifier(
        draft(
            logic={
                "format": "column_vs_column",
                "column_name": "status",
                "operator": "eq",
                "target_value": "active",
            }
        )
    )


def test_values_are_deduplicated_and_sorted_but_strings_remain_exact():
    left = draft(
        conditions=[{"column_name": "x", "operator": "eq", "filter_values": ["b", "a", "b"]}]
    )
    right = draft(conditions=[{"column_name": "x", "operator": "eq", "filter_values": ["a", "b"]}])
    assert calculate_rule_identifier(left) == calculate_rule_identifier(right)
    assert len(calculate_rule_identifier(left)) == 25
    assert calculate_rule_identifier(left).startswith("CBR1_")
    assert serialize_canonical_rule(canonicalize_rule(left)).encode("utf-8")


def test_presentation_fields_do_not_affect_identity():
    original = calculate_rule_identifier(draft())
    assert (
        calculate_rule_identifier(
            draft(
                name="other",
                description="other",
                extra_columns=[],
                hide_comparison=False,
                rule_id="R999",
            )
        )
        == original
    )


def test_parenthesization_flattens_only_same_operator():
    flat = draft(
        grouping_tree={
            "kind": "and",
            "children": [
                {"kind": "leaf", "conditionId": "c0"},
                {"kind": "leaf", "conditionId": "c1"},
            ],
        }
    )
    nested = draft(
        grouping_tree={
            "kind": "and",
            "children": [
                {
                    "kind": "and",
                    "children": [
                        {"kind": "leaf", "conditionId": "c0"},
                        {"kind": "leaf", "conditionId": "c1"},
                    ],
                }
            ],
        }
    )
    assert calculate_rule_identifier(flat) == calculate_rule_identifier(nested)
