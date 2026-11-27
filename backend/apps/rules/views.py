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
    IdentityReuseConflict,
    InvalidCursorError,
    SaveDecisionRequired,
    StaleCursorError,
    StaleRevisionError,
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
from apps.rules.services import (
    normalize_rule_draft,
    rule_definition_payload,
    validate_rule,
)


def _snapshot_to_dict(snapshot: Any) -> dict[str, Any]:
    rule = snapshot.rule
    payload = {
        "rule_id": rule.rule_id,
        "rule_identifier": snapshot.rule_identifier,
        "enabled": snapshot.enabled,
        "enabled_position": getattr(snapshot, "enabled_position", None),
        **rule_definition_payload(rule, include_empty_target_values=True),
    }
    # Optional lineage/revision metadata: additive, so old fixtures and
    # documents without these keys remain readable.
    if getattr(snapshot, "lineage_id", None) is not None:
        payload["lineage_id"] = snapshot.lineage_id
    if getattr(snapshot, "evolution_revision", None) is not None:
        payload["revision_number"] = snapshot.evolution_revision
    return payload


def _validated_draft(
    data: Any, *, allow_blank_name: bool
) -> tuple[dict[str, Any] | None, Response | None]:
    serializer = RuleSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    draft = dict(serializer.validated_data)
    if not str(draft.get("name", "")).strip():
        if not allow_blank_name:
            return None, Response(
                {"error": "Rule name is required when editing a rule."}, status=400
            )
        draft["name"] = "Unnamed"
    validation = validate_rule(draft)
    if not validation.valid:
        return None, Response({"error": "; ".join(validation.errors)}, status=400)
    return normalize_rule_draft(draft), None


def _catalog_error(exc: Exception) -> Response:
    if isinstance(exc, (StaleCursorError, InvalidCursorError)):
        return Response({"error": str(exc), "code": type(exc).__name__}, status=409)
    if isinstance(exc, (SaveDecisionRequired, StaleRevisionError, IdentityReuseConflict)):
        details = getattr(exc, "details", None) or {}
        return Response({**details, "error": str(exc)}, status=409)
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
        draft, error = _validated_draft(request.data, allow_blank_name=True)
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
        # Save controls live at the top level only: they must never leak
        # into the authored payload, hash inputs, or canonical identity.
        raw_decision = request.data.get("save_decision")
        source_identifier = request.data.get("source_identifier")
        if raw_decision is not None and raw_decision not in ("modify_current", "save_as_new"):
            return Response(
                {
                    "error": "save_decision must be 'modify_current' or 'save_as_new'.",
                    "code": "rule_save_decision_invalid",
                },
                status=400,
            )
        draft, error = _validated_draft(request.data, allow_blank_name=False)
        if error:
            return error
        assert draft is not None
        try:
            result = update_catalog_rule(
                rule_id,
                draft,
                save_decision=raw_decision,
                source_identifier=source_identifier,
                require_confirmation=True,
                source="ui_edit",
            )
            response = _snapshot_to_dict(result.rule)
            response["previous_rule_id"] = result.previous_rule_id
            response["resulting_rule_id"] = result.rule.rule.rule_id
            response["save_decision"] = result.save_decision
            if result.lineage_id is not None:
                response["lineage_id"] = result.lineage_id
            if result.evolution_event_id is not None:
                response["evolution_event_id"] = result.evolution_event_id
            if result.saved_as_new:
                response["saved_as_new"] = True
                if result.equivalent_rule_id is not None:
                    response["equivalent_rule"] = True
                    response["equivalent_rule_id"] = result.equivalent_rule_id
                return Response(response, status=201)
            return Response(response)
        except SaveDecisionRequired as exc:
            return Response(exc.details, status=409)
        except StaleRevisionError as exc:
            return Response(exc.details, status=409)
        except IdentityReuseConflict as exc:
            return Response(exc.details, status=409)
        except CatalogError as exc:
            return _catalog_error(exc)

    def delete(self, request: Request, rule_id: str) -> Response:
        try:
            return Response(_snapshot_to_dict(archive_catalog_rule(rule_id)))
        except CatalogError as exc:
            return Response({"error": str(exc)}, status=404)


class RuleHistoryView(APIView):  # type: ignore[misc]
    """Read-only revision history for one rule's business lineage."""

    def get(self, request: Request, rule_id: str) -> Response:
        from apps.rules import evolution as rule_evolution

        try:
            snapshot = get_catalog_rule(rule_id)
        except CatalogError as exc:
            return Response({"error": str(exc)}, status=404)
        lineage_id = snapshot.lineage_id
        if lineage_id is None:
            return Response(
                {
                    "rule_id": rule_id,
                    "lineage_id": None,
                    "revision_number": snapshot.evolution_revision,
                    "events": [],
                }
            )
        events = [
            rule_evolution.event_to_dict(event)
            for event in rule_evolution.lineage_events(lineage_id)
        ]
        return Response(
            {
                "rule_id": rule_id,
                "lineage_id": lineage_id,
                "revision_number": snapshot.evolution_revision,
                "events": events,
            }
        )


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
        except IdentityReuseConflict as exc:
            return Response({**exc.details, "error": str(exc)}, status=409)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=400)
