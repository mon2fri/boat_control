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


class RulesConfigDetailView(BaseConfigDetailView):
    @property
    def directory(self) -> Path:
        return get_rule_config_dir()


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
