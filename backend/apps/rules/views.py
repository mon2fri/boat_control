from __future__ import annotations

import threading
from typing import Any

from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.rules.serializers import (
    RuleSerializer,
)
from apps.rules.services import (
    RulesFile,
    _serialize_grouping_tree,
    create_rule,
    delete_rule,
    load_rules,
    save_rules,
    update_rule,
)

_rules_lock = threading.Lock()


def _rules_to_dict(rules_file: RulesFile) -> dict[str, Any]:
    rules_data: list[dict[str, Any]] = []
    for rule in rules_file.rules:
        rule_dict: dict[str, Any] = {
            "rule_id": rule.rule_id,
            "name": rule.name,
            "description": rule.description,
            "conditions": [
                {
                    "column_name": c.column_name,
                    "operator": c.operator,
                    "filter_value": c.filter_value,
                    "filter_values": list(c.filter_values or (c.filter_value,)),
                }
                for c in rule.conditions
            ],
            "logic": {
                "format": rule.logic.format,
                "column_name": rule.logic.column_name,
                "operator": rule.logic.operator,
                "target_value": rule.logic.target_value,
                **(
                    {"target_values": list(rule.logic.target_values)}
                    if rule.logic.target_values
                    else {}
                ),
                "comparison_mode": rule.logic.comparison_mode,
            },
            "extra_columns": list(rule.extra_columns),
        }
        if rule.condition_relation:
            rule_dict["condition_relation"] = rule.condition_relation
        tree = _serialize_grouping_tree(rule.grouping_tree)
        if tree is not None:
            rule_dict["grouping_tree"] = tree
        rules_data.append(rule_dict)
    return {"version": rules_file.version, "rules": rules_data}


class RulesListView(APIView):  # type: ignore[misc]
    def get(self, request: Request) -> Response:
        rules_file = load_rules()
        return Response(_rules_to_dict(rules_file))

    def post(self, request: Request) -> Response:
        serializer = RuleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with _rules_lock:
            rules_file = load_rules()
            try:
                new_file, rule = create_rule(rules_file, serializer.validated_data)
                save_rules(new_file)
                return Response(
                    {"rule_id": rule.rule_id, "message": "Rule created."},
                    status=201,
                )
            except ValueError as e:
                return Response({"error": str(e)}, status=400)


class RuleDetailView(APIView):  # type: ignore[misc]
    def get(self, request: Request, rule_id: str) -> Response:
        rules_file = load_rules()
        for rule in rules_file.rules:
            if rule.rule_id == rule_id:
                data: dict[str, Any] = {
                    "rule_id": rule.rule_id,
                    "name": rule.name,
                    "description": rule.description,
                    "conditions": [
                        {
                            "column_name": c.column_name,
                            "operator": c.operator,
                            "filter_value": c.filter_value,
                            "filter_values": list(c.filter_values or (c.filter_value,)),
                        }
                        for c in rule.conditions
                    ],
                    "logic": {
                        "format": rule.logic.format,
                        "column_name": rule.logic.column_name,
                        "operator": rule.logic.operator,
                        "target_value": rule.logic.target_value,
                        "comparison_mode": rule.logic.comparison_mode,
                    },
                    "extra_columns": list(rule.extra_columns),
                }
                if rule.condition_relation:
                    data["condition_relation"] = rule.condition_relation
                tree = _serialize_grouping_tree(rule.grouping_tree)
                if tree is not None:
                    data["grouping_tree"] = tree
                return Response(data)
        return Response({"error": f"Rule {rule_id} not found."}, status=404)

    def put(self, request: Request, rule_id: str) -> Response:
        serializer = RuleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with _rules_lock:
            rules_file = load_rules()
            try:
                new_file = update_rule(rules_file, rule_id, serializer.validated_data)
                save_rules(new_file)
                return Response({"rule_id": rule_id, "message": "Rule updated."})
            except ValueError as e:
                return Response({"error": str(e)}, status=400)

    def delete(self, request: Request, rule_id: str) -> Response:
        with _rules_lock:
            rules_file = load_rules()
            try:
                new_file = delete_rule(rules_file, rule_id)
                save_rules(new_file)
                return Response({"rule_id": rule_id, "message": "Rule deleted."})
            except ValueError as e:
                return Response({"error": str(e)}, status=404)
