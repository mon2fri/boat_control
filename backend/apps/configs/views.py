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


class SettingsConfigListView(BaseConfigListView):
    config_setting = "SETTINGS_CONFIG_DIR"


class SettingsConfigDetailView(BaseConfigDetailView):
    config_setting = "SETTINGS_CONFIG_DIR"


class RulesConfigListView(BaseConfigListView):
    config_setting = "RULES_CONFIG_DIR"


class RulesConfigDetailView(BaseConfigDetailView):
    config_setting = "RULES_CONFIG_DIR"


class FiltersConfigListView(BaseConfigListView):
    config_setting = "FILTERS_CONFIG_DIR"


class FiltersConfigDetailView(BaseConfigDetailView):
    config_setting = "FILTERS_CONFIG_DIR"
