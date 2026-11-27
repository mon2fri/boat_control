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
from apps.rules.identifiers import RuleIdentityError, calculate_rule_identifier
from apps.rules.models import StoredValidationRule
from apps.rules.repository import (
    CatalogError,
    IdentityReuseConflict,
    RuleConfigConflict,
    apply_rule_configuration,
    configuration_conflicts,
    list_enabled_catalog_rules,
    reinstate_catalog_rule,
)
from apps.rules.serializers import RuleSerializer
from apps.rules.services import (
    normalize_rule_draft,
    rule_definition_payload,
    validate_rule,
)
from apps.runs.template_columns import (
    TemplateColumnError,
    normalize_rows_and_columns_content,
)
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
        except IdentityReuseConflict as exc:
            return Response({**exc.details, "error": str(exc)}, status=409)
        return Response({"name": config.name, "version": config.version, **result})


class RuleConfigImportView(APIView):  # type: ignore[misc]
    def post(self, request: Request) -> Response:
        content = request.data.get("content", request.data.get("rules", []))
        config_name = request.data.get("config_name")
        decisions = request.data.get("decisions")
        source = request.data.get("source") or (
            "named_config_import" if config_name or isinstance(decisions, dict) else "yaml_import"
        )
        try:
            return Response(
                _import_rule_content(
                    content,
                    config_name=config_name,
                    decisions=decisions,
                    persist_config=bool(decisions),
                    source=source,
                )
            )
        except serializers.ValidationError as exc:
            return Response({"error": str(exc.detail)}, status=400)
        except RuleConfigConflict as exc:
            return Response({"error": str(exc), "conflicts": exc.conflicts}, status=409)
        except IdentityReuseConflict as exc:
            return Response({**exc.details, "error": str(exc)}, status=409)
        except (CatalogError, ValueError) as exc:
            return Response({"error": str(exc)}, status=400)


def _enabled_rule_payload() -> list[dict[str, Any]]:
    return [_rule_snapshot_payload(snapshot) for snapshot in list_enabled_catalog_rules()]


def _rule_snapshot_payload(snapshot: Any) -> dict[str, Any]:
    # The shared serializer includes the executable grouping tree and the
    # complete outcome expression (legacy ``logic`` or grouped clauses) so an
    # export/import round trip cannot silently drop grouping. The lineage id
    # is explicit revision metadata: an annotated reimport may revise that
    # lineage, while unannotated payloads always import as independent rules.
    payload = {
        "rule_identifier": snapshot.rule_identifier,
        **rule_definition_payload(
            snapshot.rule,
            include_empty_target_values=True,
        ),
    }
    lineage_id = getattr(snapshot, "lineage_id", None)
    if lineage_id is not None:
        payload["lineage_id"] = lineage_id
    return payload


def _import_rule_content(
    content: Any,
    *,
    config_name: str | None = None,
    decisions: dict[str, str] | None = None,
    persist_config: bool = False,
    source: str = "named_config_import",
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
            # Lineage metadata is not part of the executable definition and
            # must not affect the hash check below.
            draft_without_identifier = {
                key: value
                for key, value in raw_draft.items()
                if key not in ("rule_identifier", "lineage_id")
            }
            expected_identifier = calculate_rule_identifier(draft_without_identifier)
            if supplied_identifier != expected_identifier:
                raise ValueError(f"Rule {index} has a mismatching rule_identifier.")
    # Explicit revision metadata: 1-based draft position to lineage id.
    # Unannotated drafts carry no hint and import as independent rules.
    lineage_hints = {
        index: raw_draft["lineage_id"]
        for index, raw_draft in enumerate(drafts, start=1)
        if isinstance(raw_draft, dict) and raw_draft.get("lineage_id")
    }
    serializer = RuleSerializer(data=drafts, many=True)
    serializer.is_valid(raise_exception=True)
    validated = [dict(item) for item in serializer.validated_data]
    for raw_draft, draft in zip(drafts, validated, strict=True):
        validation = validate_rule(draft)
        if not validation.valid:
            name = str(draft.get("name") or raw_draft.get("name") or "Unnamed rule")
            message = "; ".join(validation.errors)
            # A draft that fails grouping validation may also be unhashable as a
            # canonical identity. Keep the actionable validation error instead of
            # letting identity calculation mask it during error reporting.
            try:
                identifier = calculate_rule_identifier(draft)
            except RuleIdentityError:
                identifier = "uncomputable identity"
                stored = None
            else:
                stored = StoredValidationRule.objects.filter(identity_id=identifier).first()
            rule_id = stored.rule_id if stored is not None else raw_draft.get("rule_id", "new")
            raise ValueError(f"{name}({rule_id}, {identifier}: {message})")
    validated = [normalize_rule_draft(draft) for draft in validated]
    conflicts = configuration_conflicts(validated)
    if conflicts and not isinstance(decisions, dict):
        raise RuleConfigConflict(conflicts)
    if conflicts:
        assert decisions is not None
        resolved: list[dict[str, Any]] = []
        by_identifier = {item["rule_identifier"]: item for item in conflicts}
        decisions_map = decisions or {}
        for draft in validated:
            identifier = calculate_rule_identifier(draft)
            conflict = by_identifier.get(identifier)
            if conflict is None:
                resolved.append(draft)
                continue
            decision = decisions_map.get(identifier)
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
    result = apply_rule_configuration(
        validated, config_name=config_name, lineage_hints=lineage_hints, source=source
    )
    if persist_config and config_name:
        existing = get_config(get_rule_config_dir(), config_name)
        if existing is not None:
            persisted = []
            for rule_id, identifier in result.bindings.items():
                stored = StoredValidationRule.objects.filter(rule_id=rule_id).first()
                matched: dict[str, Any] | None = None
                for item in validated:
                    if calculate_rule_identifier(item) == identifier:
                        matched = item
                        break
                entry: dict[str, Any] = {"rule_identifier": identifier}
                if matched is not None:
                    entry.update(matched)
                if stored is not None and stored.lineage_id is not None:
                    entry["lineage_id"] = stored.lineage_id
                persisted.append(entry)
            update_config(get_rule_config_dir(), config_name, persisted, existing.version)
    return {
        "imported": result.imported,
        "reused": result.reused,
        "enabled": result.enabled,
        "bindings": result.bindings,
    }


def _validate_filter_config_content(content: Any) -> Any:
    from apps.runs.grouped_logic import validate_filter_grouping

    if not isinstance(content, dict):
        return content
    rows = content.get("rows", [])
    if not isinstance(rows, list):
        raise ValueError("Filter configuration rows must be a list.")
    relation = content.get("filter_relation", content.get("filterRelation"))
    tree = content.get("filter_grouping_tree", content.get("filterGroupingTree"))
    errors = validate_filter_grouping(rows, relation, tree)
    if errors:
        raise ValueError(
            "Invalid filter grouping configuration: " + "; ".join(errors)
        )
    return content


class FiltersConfigListView(BaseConfigListView):
    @property
    def directory(self) -> Path:
        return get_filter_config_dir()

    def post(self, request: Request) -> Response:
        serializer = ConfigCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            content = _validate_filter_config_content(
                serializer.validated_data["content"]
            )
            config = create_config(
                self.directory,
                serializer.validated_data["name"],
                content,
            )
        except (ConfigNameError, ValueError) as exc:
            return Response({"error": str(exc)}, status=400)
        return Response(
            {"name": config.name, "version": config.version},
            status=201,
        )


class FiltersConfigDetailView(BaseConfigDetailView):
    @property
    def directory(self) -> Path:
        return get_filter_config_dir()

    def put(self, request: Request, name: str) -> Response:
        serializer = ConfigUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            content = _validate_filter_config_content(
                serializer.validated_data["content"]
            )
            config = update_config(
                self.directory,
                name,
                content,
                serializer.validated_data["version"],
            )
        except ConfigNotFoundError as exc:
            return Response({"error": str(exc)}, status=404)
        except ConfigConflictError as exc:
            return Response({"error": str(exc)}, status=409)
        except (ConfigNameError, ValueError) as exc:
            return Response({"error": str(exc)}, status=400)
        return Response(_config_to_response(config))


class RowsAndColumnsConfigListView(BaseConfigListView):
    @property
    def directory(self) -> Path:
        return get_rows_and_columns_config_dir()

    def post(self, request: Request) -> Response:
        serializer = ConfigCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            content = normalize_rows_and_columns_content(
                serializer.validated_data["content"]
            )
            config = create_config(
                self.directory,
                serializer.validated_data["name"],
                content,
            )
        except TemplateColumnError as exc:
            return Response({"error": str(exc)}, status=400)
        except ConfigNameError as exc:
            return Response({"error": str(exc)}, status=400)
        return Response(
            {"name": config.name, "version": config.version},
            status=201,
        )


class RowsAndColumnsConfigDetailView(BaseConfigDetailView):
    @property
    def directory(self) -> Path:
        return get_rows_and_columns_config_dir()

    def get(self, request: Request, name: str) -> Response:
        config = get_config(self.directory, name)
        if config is None:
            return Response(
                {"error": f"Configuration '{name}' not found."}, status=404
            )
        try:
            content = normalize_rows_and_columns_content(config.content)
        except TemplateColumnError as exc:
            return Response({"error": str(exc)}, status=400)
        return Response(
            {"name": config.name, "version": config.version, "content": content}
        )

    def put(self, request: Request, name: str) -> Response:
        serializer = ConfigUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            content = normalize_rows_and_columns_content(
                serializer.validated_data["content"]
            )
            config = update_config(
                self.directory,
                name,
                content,
                serializer.validated_data["version"],
            )
        except TemplateColumnError as exc:
            return Response({"error": str(exc)}, status=400)
        except ConfigNotFoundError as exc:
            return Response({"error": str(exc)}, status=404)
        except ConfigConflictError as exc:
            return Response({"error": str(exc)}, status=409)
        except ConfigNameError as exc:
            return Response({"error": str(exc)}, status=400)
        return Response(_config_to_response(config))
