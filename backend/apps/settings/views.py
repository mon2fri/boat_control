from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.settings.serializers import SettingsSerializer
from apps.settings.services import load_settings, update_settings


def _settings_response(app_settings):  # type: ignore[no-untyped-def]
    return {
        "application_name": app_settings.application_name,
        "default_remote_path": app_settings.default_remote_path,
        "rule_config_path": app_settings.rule_config_path,
        "rows_and_columns_config_path": app_settings.rows_and_columns_config_path,
        "filter_config_path": app_settings.filter_config_path,
        "full_set_confirmation_rows": app_settings.full_set_confirmation_rows,
        "run_history_path": app_settings.run_history_path,
    }


class SettingsView(APIView):  # type: ignore[misc]

    def get(self, request: Request) -> Response:
        app_settings = load_settings()
        return Response(_settings_response(app_settings))

    def put(self, request: Request) -> Response:
        serializer = SettingsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated = update_settings(serializer.validated_data)
        return Response(_settings_response(updated))
