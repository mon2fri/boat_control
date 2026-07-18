from rest_framework import serializers


class SettingsSerializer(serializers.Serializer):  # type: ignore[misc]
    preset_source_paths = serializers.ListField(
        child=serializers.CharField(), required=False
    )
    rules_config_path = serializers.CharField(required=False, allow_blank=True)
    filters_config_path = serializers.CharField(required=False, allow_blank=True)
    full_set_threshold = serializers.IntegerField(min_value=1, required=False)
