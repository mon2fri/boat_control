from __future__ import annotations

from pathlib import Path
from typing import Any, cast

from django.conf import settings
from rest_framework import serializers
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.configs.serializers import (
    ConfigCreateSerializer,
    ConfigListResponseSerializer,
    ConfigUpdateSerializer,
    RuleConfigSaveSerializer,
)
from apps.configs.services import (
    ConfigConflictError,
    ConfigFile,
    ConfigNameError,
    ConfigNotFoundError,
    create_config,
    delete_config,
    get_config,
    list_configs,
    update_config,
)
from apps.rules.identifiers import calculate_rule_identifier
from apps.rules.models import StoredValidationRule
from apps.rules.repository import (
    CatalogError,
    RuleConfigConflict,
    apply_rule_configuration,
    configuration_conflicts,
    list_enabled_catalog_rules,
    reinstate_catalog_rule,
)
from apps.rules.serializers import RuleSerializer
from apps.rules.services import validate_rule
from apps.settings.services import (
    get_filter_config_dir,
    get_rows_and_columns_config_dir,
    get_rule_config_dir,
)


class BaseConfigListView(APIView):  # type: ignore[misc]
    config_setting: str = ""

    @property
    def directory(self) -> Path:
        return cast(Path, getattr(settings, self.config_setting))

    def get(self, request: Request) -> Response:
        configs = list_configs(self.directory)
        serializer = ConfigListResponseSerializer(
            [{"name": c.name, "version": c.version} for c in configs],
            many=True,
        )
        return Response(serializer.data)

    def post(self, request: Request) -> Response:
        serializer = ConfigCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            config = create_config(
                self.directory,
                serializer.validated_data["name"],
                serializer.validated_data["content"],
            )
        except ConfigNameError as exc:
            return Response({"error": str(exc)}, status=400)
        return Response(
            {"name": config.name, "version": config.version},
            status=201,
        )


class BaseConfigDetailView(APIView):  # type: ignore[misc]
    config_setting: str = ""

    @property
    def directory(self) -> Path:
        return cast(Path, getattr(settings, self.config_setting))

    def get(self, request: Request, name: str) -> Response:
        config = get_config(self.directory, name)
        if config is None:
            return Response(
                {"error": f"Configuration '{name}' not found."}, status=404
            )
        return Response(_config_to_response(config))

    def put(self, request: Request, name: str) -> Response:
        serializer = ConfigUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            config = update_config(
                self.directory,
                name,
                serializer.validated_data["content"],
                serializer.validated_data["version"],
            )
        except ConfigNotFoundError as exc:
            return Response({"error": str(exc)}, status=404)
        except ConfigConflictError as exc:
            return Response({"error": str(exc)}, status=409)
        except ConfigNameError as exc:
            return Response({"error": str(exc)}, status=400)
        return Response(_config_to_response(config))

    def delete(self, request: Request, name: str) -> Response:
        try:
            delete_config(self.directory, name)
        except ConfigNotFoundError as exc:
            return Response({"error": str(exc)}, status=404)
        return Response(status=204)


def _config_to_response(config: ConfigFile) -> dict[str, Any]:
    return {
        "name": config.name,
        "version": config.version,
        "content": config.content,
    }


class RulesConfigListView(BaseConfigListView):
    @property
    def directory(self) -> Path:
        return get_rule_config_dir()

    def post(self, request: Request) -> Response:
        data = request.data.copy()
        data.setdefault("content", [])
        serializer = ConfigCreateSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        try:
            name = serializer.validated_data["name"]
            content = _enabled_rule_payload()
            config = create_config(self.directory, name, content)
        except ConfigNameError as exc:
            return Response({"error": str(exc)}, status=400)
        return Response(
            {"name": config.name, "version": config.version, "content": content},
            status=201,
        )


class RulesConfigDetailView(BaseConfigDetailView):
    @property
    def directory(self) -> Path:
        return get_rule_config_dir()

    def put(self, request: Request, name: str) -> Response:
        if "content" not in request.data:
            serializer = RuleConfigSaveSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            try:
                existing = get_config(self.directory, name)
                if existing is None:
                    raise ConfigNotFoundError(f"Configuration '{name}' not found.")
                version = serializer.validated_data["version"]
                if existing.version != version:
                    raise ConfigConflictError(
                        f"Configuration '{name}' has been modified by another session."
                    )
                content = _enabled_rule_payload()
                config = update_config(self.directory, name, content, version)
            except (ConfigNotFoundError, ConfigConflictError, ConfigNameError) as exc:
                status = 409 if isinstance(exc, ConfigConflictError) else 404
                return Response({"error": str(exc)}, status=status)
            return Response({"name": config.name, "version": config.version, "content": content})

        serializer = ConfigUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        content = serializer.validated_data["content"]
        try:
            existing = get_config(self.directory, name)
            if existing is None:
                raise ConfigNotFoundError(f"Configuration '{name}' not found.")
            if existing.version != serializer.validated_data["version"]:
                raise ConfigConflictError(
                    f"Configuration '{name}' has been modified by another session."
                )
            result = _import_rule_content(content, config_name=name)
            config = update_config(
                self.directory, name, content, serializer.validated_data["version"]
            )
        except (ConfigNotFoundError, ConfigConflictError, ConfigNameError) as exc:
            status = (
                409
                if isinstance(exc, ConfigConflictError)
                else 404
                if isinstance(exc, ConfigNotFoundError)
                else 400
            )
            return Response({"error": str(exc)}, status=status)
        return Response({"name": config.name, "version": config.version, **result})


class RuleConfigImportView(APIView):  # type: ignore[misc]
    def post(self, request: Request) -> Response:
        content = request.data.get("content", request.data.get("rules", []))
        config_name = request.data.get("config_name")
        decisions = request.data.get("decisions")
        try:
            return Response(
                _import_rule_content(
                    content,
                    config_name=config_name,
                    decisions=decisions,
                    persist_config=bool(decisions),
                )
            )
        except serializers.ValidationError as exc:
            return Response({"error": str(exc.detail)}, status=400)
        except RuleConfigConflict as exc:
            return Response({"error": str(exc), "conflicts": exc.conflicts}, status=409)
        except (CatalogError, ValueError) as exc:
            return Response({"error": str(exc)}, status=400)


def _enabled_rule_payload() -> list[dict[str, Any]]:
    return [_rule_snapshot_payload(snapshot) for snapshot in list_enabled_catalog_rules()]


def _rule_snapshot_payload(snapshot: Any) -> dict[str, Any]:
    rule = snapshot.rule
    payload: dict[str, Any] = {
        "rule_identifier": snapshot.rule_identifier,
        "name": rule.name,
        "description": rule.description,
        "conditions": [
            {
                "column_name": condition.column_name,
                "operator": condition.operator,
                "filter_value": condition.filter_value,
                "filter_values": list(condition.filter_values),
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
        payload["condition_relation"] = rule.condition_relation
    if rule.grouping is not None:
        payload["grouping"] = rule.grouping
    return payload


def _import_rule_content(
    content: Any,
    *,
    config_name: str | None = None,
    decisions: dict[str, str] | None = None,
    persist_config: bool = False,
) -> dict[str, Any]:
    if isinstance(content, dict):
        if isinstance(content.get("items"), list):
            drafts = content["items"]
        else:
            drafts = content.get("rules", [])
    else:
        drafts = content
    if not isinstance(drafts, list):
        raise ValueError("Rule configuration must contain a rules array.")
    for index, raw_draft in enumerate(drafts, start=1):
        if not isinstance(raw_draft, dict):
            raise ValueError(f"Rule {index} must be an object.")
        supplied_identifier = raw_draft.get("rule_identifier")
        if supplied_identifier is not None:
            draft_without_identifier = {
                key: value for key, value in raw_draft.items() if key != "rule_identifier"
            }
            expected_identifier = calculate_rule_identifier(draft_without_identifier)
            if supplied_identifier != expected_identifier:
                raise ValueError(f"Rule {index} has a mismatching rule_identifier.")
    serializer = RuleSerializer(data=drafts, many=True)
    serializer.is_valid(raise_exception=True)
    validated = [dict(item) for item in serializer.validated_data]
    for raw_draft, draft in zip(drafts, validated, strict=True):
        validation = validate_rule(draft)
        if not validation.valid:
            identifier = calculate_rule_identifier(draft)
            stored = StoredValidationRule.objects.filter(identity_id=identifier).first()
            rule_id = stored.rule_id if stored is not None else raw_draft.get("rule_id", "new")
            name = str(draft.get("name") or raw_draft.get("name") or "Unnamed rule")
            message = "; ".join(validation.errors)
            raise ValueError(f"{name}({rule_id}, {identifier}: {message})")
    conflicts = configuration_conflicts(validated)
    if conflicts and not isinstance(decisions, dict):
        raise RuleConfigConflict(conflicts)
    if conflicts:
        resolved: list[dict[str, Any]] = []
        by_identifier = {item["rule_identifier"]: item for item in conflicts}
        for draft in validated:
            identifier = calculate_rule_identifier(draft)
            conflict = by_identifier.get(identifier)
            if conflict is None:
                resolved.append(draft)
                continue
            decision = decisions.get(identifier)
            if decision == "remove":
                continue
            if decision == "reinstate" or decision == "maintain_original":
                reinstate_catalog_rule(conflict["rule_id"])
                resolved.append(draft)
                continue
            if decision == "accept_updated" and conflict.get("replacement_rule_id"):
                resolved.append(dict(conflict["replacement_payload"]))
                continue
            raise RuleConfigConflict([conflict])
        validated = resolved
    result = apply_rule_configuration(validated, config_name=config_name)
    if persist_config and config_name:
        existing = get_config(get_rule_config_dir(), config_name)
        if existing is not None:
            persisted = [
                {"rule_identifier": calculate_rule_identifier(draft), **draft}
                for draft in validated
            ]
            update_config(get_rule_config_dir(), config_name, persisted, existing.version)
    return {
        "imported": result.imported,
        "reused": result.reused,
        "enabled": result.enabled,
        "bindings": result.bindings,
    }


class FiltersConfigListView(BaseConfigListView):
    @property
    def directory(self) -> Path:
        return get_filter_config_dir()


class FiltersConfigDetailView(BaseConfigDetailView):
    @property
    def directory(self) -> Path:
        return get_filter_config_dir()


class RowsAndColumnsConfigListView(BaseConfigListView):
    @property
    def directory(self) -> Path:
        return get_rows_and_columns_config_dir()


class RowsAndColumnsConfigDetailView(BaseConfigDetailView):
    @property
    def directory(self) -> Path:
        return get_rows_and_columns_config_dir()
