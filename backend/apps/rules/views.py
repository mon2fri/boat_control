from __future__ import annotations

import threading
from typing import Any

from rest_framework.request import Request  # type: ignore[import-untyped]
from rest_framework.response import Response  # type: ignore[import-untyped]
from rest_framework.views import APIView  # type: ignore[import-untyped]

from apps.rules.serializers import (
    RemoteRulesRequestSerializer,
    RuleSerializer,
)
from apps.rules.services import (
    RulesFile,
    create_rule,
    delete_rule,
    load_remote_rules,
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
                }
                for c in rule.conditions
            ],
            "logic": {
                "format": rule.logic.format,
                "column_name": rule.logic.column_name,
                "operator": rule.logic.operator,
                "target_value": rule.logic.target_value,
            },
        }
        if rule.condition_relation:
            rule_dict["condition_relation"] = rule.condition_relation
        if rule.grouping:
            rule_dict["grouping"] = rule.grouping
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
                new_file, rule = create_rule(
                    rules_file, serializer.validated_data
                )
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
                return Response(
                    {
                        "rule_id": rule.rule_id,
                        "name": rule.name,
                        "description": rule.description,
                        "conditions": [
                            {
                                "column_name": c.column_name,
                                "operator": c.operator,
                                "filter_value": c.filter_value,
                            }
                            for c in rule.conditions
                        ],
                        "logic": {
                            "format": rule.logic.format,
                            "column_name": rule.logic.column_name,
                            "operator": rule.logic.operator,
                            "target_value": rule.logic.target_value,
                        },
                    }
                )
        return Response({"error": f"Rule {rule_id} not found."}, status=404)

    def put(self, request: Request, rule_id: str) -> Response:
        serializer = RuleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with _rules_lock:
            rules_file = load_rules()
            try:
                new_file = update_rule(
                    rules_file, rule_id, serializer.validated_data
                )
                save_rules(new_file)
                return Response(
                    {"rule_id": rule_id, "message": "Rule updated."}
                )
            except ValueError as e:
                return Response({"error": str(e)}, status=400)

    def delete(self, request: Request, rule_id: str) -> Response:
        with _rules_lock:
            rules_file = load_rules()
            try:
                new_file = delete_rule(rules_file, rule_id)
                save_rules(new_file)
                return Response(
                    {"rule_id": rule_id, "message": "Rule deleted."}
                )
            except ValueError as e:
                return Response({"error": str(e)}, status=404)


class RemoteRulesView(APIView):  # type: ignore[misc]
    def post(self, request: Request) -> Response:
        serializer = RemoteRulesRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            remote_rules = load_remote_rules(serializer.validated_data["url"])
            save_rules(remote_rules)
            return Response(
                {
                    "message": f"Loaded {len(remote_rules.rules)} rules from remote.",
                    "version": remote_rules.version,
                }
            )
        except Exception as e:
            return Response({"error": f"Failed to load remote rules: {e}"}, status=400)
