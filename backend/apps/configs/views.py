from __future__ import annotations

from pathlib import Path
from typing import Any, cast

from django.conf import settings
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.configs.serializers import (
    ConfigCreateSerializer,
    ConfigListResponseSerializer,
    ConfigUpdateSerializer,
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
from apps.rules.repository import apply_rule_configuration, list_enabled_catalog_rules
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
            result = _import_rule_content(content)
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
        try:
            return Response(_import_rule_content(content))
        except ValueError as exc:
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


def _import_rule_content(content: Any) -> dict[str, Any]:
    drafts = content.get("rules", []) if isinstance(content, dict) else content
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
    for index, draft in enumerate(validated, start=1):
        validation = validate_rule(draft)
        if not validation.valid:
            raise ValueError(f"Rule {index} invalid: {'; '.join(validation.errors)}")
    result = apply_rule_configuration(validated)
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
