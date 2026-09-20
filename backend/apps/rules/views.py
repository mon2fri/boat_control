from __future__ import annotations

from typing import Any

from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.rules.identifiers import calculate_rule_identifier
from apps.rules.models import StoredValidationRule
from apps.rules.repository import (
    CatalogCorruptionError,
    CatalogError,
    IdentityCollisionError,
    InvalidCursorError,
    StaleCursorError,
    archive_catalog_rule,
    create_catalog_rule,
    get_catalog_rule,
    list_catalog_rules,
    reorder_enabled_rules,
    set_rules_disabled,
    set_rules_enabled,
    update_catalog_rule,
)
from apps.rules.serializers import (
    EnablementSerializer,
    ReorderRulesSerializer,
    RuleSerializer,
)
from apps.rules.services import validate_rule


def _snapshot_to_dict(snapshot: Any) -> dict[str, Any]:
    rule = snapshot.rule
    result: dict[str, Any] = {
        "rule_id": rule.rule_id,
        "rule_identifier": snapshot.rule_identifier,
        "enabled": snapshot.enabled,
        "enabled_position": getattr(snapshot, "enabled_position", None),
        "name": rule.name,
        "description": rule.description,
        "conditions": [
            {
                "column_name": condition.column_name,
                "operator": condition.operator,
                "filter_value": condition.filter_value,
                "filter_values": list(condition.filter_values or (condition.filter_value,)),
            }
            for condition in rule.conditions
        ],
        "logic": {
            "format": rule.logic.format,
            "column_name": rule.logic.column_name,
            "operator": rule.logic.operator,
            "target_value": rule.logic.target_value,
            "target_values": list(rule.logic.target_values),
            "comparison_mode": rule.logic.comparison_mode,
        },
        "extra_columns": list(rule.extra_columns),
        "hide_comparison": rule.hide_comparison,
    }
    if rule.condition_relation is not None:
        result["condition_relation"] = rule.condition_relation
    if rule.grouping is not None:
        result["grouping"] = rule.grouping
    if rule.grouping_tree is not None:
        result["grouping_tree"] = _serialize_grouping_tree(rule.grouping_tree)
    return result


def _serialize_grouping_tree(node: Any) -> Any:
    if node is None:
        return None
    if hasattr(node, "condition_id"):
        return {"kind": "leaf", "conditionId": node.condition_id}
    return {
        "kind": node.kind,
        "children": [_serialize_grouping_tree(child) for child in node.children],
    }


def _validated_draft(data: Any) -> tuple[dict[str, Any] | None, Response | None]:
    serializer = RuleSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    draft = dict(serializer.validated_data)
    validation = validate_rule(draft)
    if not validation.valid:
        return None, Response({"error": "; ".join(validation.errors)}, status=400)
    return draft, None


def _catalog_error(exc: Exception) -> Response:
    if isinstance(exc, (StaleCursorError, InvalidCursorError)):
        return Response({"error": str(exc), "code": type(exc).__name__}, status=409)
    if isinstance(exc, CatalogError):
        return Response({"error": str(exc)}, status=400)
    return Response({"error": str(exc)}, status=500)


class RulesListView(APIView):  # type: ignore[misc]
    def get(self, request: Request) -> Response:
        try:
            page = list_catalog_rules(request.query_params.get("cursor"))
        except Exception as exc:
            return _catalog_error(exc)
        return Response(
            {
                "version": 2,
                "rules": [_snapshot_to_dict(item) for item in page.rules],
                "pinned_rule_ids": list(page.pinned_rule_ids),
                "total": page.total_count,
                "revision": page.revision,
                "next_cursor": page.next_cursor,
                "has_more": page.has_more,
            }
        )

    def post(self, request: Request) -> Response:
        draft, error = _validated_draft(request.data)
        if error:
            return error
        assert draft is not None
        try:
            identifier = calculate_rule_identifier(draft)
            equivalent = StoredValidationRule.objects.filter(identity_id=identifier).first()
            snapshot = create_catalog_rule(draft, enabled=True)
            response = _snapshot_to_dict(snapshot)
            if equivalent is not None:
                response["equivalent_rule"] = True
                response["equivalent_rule_id"] = equivalent.rule_id
            return Response(response, status=201)
        except (CatalogError, IdentityCollisionError, CatalogCorruptionError) as exc:
            return _catalog_error(exc)


class RuleDetailView(APIView):  # type: ignore[misc]
    def get(self, request: Request, rule_id: str) -> Response:
        try:
            return Response(_snapshot_to_dict(get_catalog_rule(rule_id)))
        except CatalogError as exc:
            return Response({"error": str(exc)}, status=404)

    def put(self, request: Request, rule_id: str) -> Response:
        draft, error = _validated_draft(request.data)
        if error:
            return error
        assert draft is not None
        try:
            result = update_catalog_rule(rule_id, draft)
            return Response(
                {
                    **_snapshot_to_dict(result.rule),
                    "previous_rule_id": result.previous_rule_id,
                    "resulting_rule_id": result.rule.rule.rule_id,
                }
            )
        except CatalogError as exc:
            return _catalog_error(exc)

    def delete(self, request: Request, rule_id: str) -> Response:
        try:
            return Response(_snapshot_to_dict(archive_catalog_rule(rule_id)))
        except CatalogError as exc:
            return Response({"error": str(exc)}, status=404)


class EnablementView(APIView):  # type: ignore[misc]
    def post(self, request: Request) -> Response:
        serializer = EnablementSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ids = serializer.validated_data["rule_ids"]
        try:
            rules = (
                set_rules_enabled(ids)
                if serializer.validated_data["enabled"]
                else set_rules_disabled(ids)
            )
            return Response({"rules": [_snapshot_to_dict(rule) for rule in rules]})
        except CatalogError as exc:
            return _catalog_error(exc)


class ReorderRulesView(APIView):  # type: ignore[misc]
    def post(self, request: Request) -> Response:
        serializer = ReorderRulesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            rules = reorder_enabled_rules(serializer.validated_data["rule_ids"])
            return Response(
                {
                    "message": "Rules reordered.",
                    "rule_ids": [rule.rule.rule_id for rule in rules],
                    "rules": [_snapshot_to_dict(rule) for rule in rules],
                }
            )
        except CatalogError as exc:
            return _catalog_error(exc)


class ReplaceRulesView(APIView):  # type: ignore[misc]
    """Compatibility route: apply a validated configuration without deleting history."""

    def post(self, request: Request) -> Response:
        from apps.configs.views import _import_rule_content

        try:
            result = _import_rule_content(request.data.get("rules", []))
            from apps.rules.models import RuleStoreState

            state = RuleStoreState.objects.get(singleton_key=1)
            return Response(
                {
                    "message": "Rules replaced.",
                    "rule_count": result["enabled"],
                    "next_index": state.next_index,
                    **result,
                }
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=400)
