from rest_framework import serializers


class SettingsSerializer(serializers.Serializer):  # type: ignore[misc]
    application_name = serializers.CharField(required=False, allow_blank=False)
    default_remote_path = serializers.CharField(required=False, allow_blank=True)
    rule_config_path = serializers.CharField(required=False, allow_blank=False)
    rows_and_columns_config_path = serializers.CharField(required=False, allow_blank=False)
    filter_config_path = serializers.CharField(required=False, allow_blank=False)
    family_config_path = serializers.CharField(required=False, allow_blank=False)
    full_set_confirmation_rows = serializers.IntegerField(min_value=1, required=False)
    run_history_path = serializers.CharField(required=False, allow_blank=False)
