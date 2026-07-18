from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.settings.serializers import SettingsSerializer
from apps.settings.services import load_settings, update_settings


class SettingsView(APIView):  # type: ignore[misc]

    def get(self, request: Request) -> Response:
        app_settings = load_settings()
        return Response({
            "preset_source_paths": app_settings.preset_source_paths,
            "rules_config_path": app_settings.rules_config_path,
            "filters_config_path": app_settings.filters_config_path,
            "full_set_threshold": app_settings.full_set_threshold,
        })

    def put(self, request: Request) -> Response:
        serializer = SettingsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated = update_settings(serializer.validated_data)
        return Response({
            "preset_source_paths": updated.preset_source_paths,
            "rules_config_path": updated.rules_config_path,
            "filters_config_path": updated.filters_config_path,
            "full_set_threshold": updated.full_set_threshold,
        })
