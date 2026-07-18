from rest_framework import serializers


class ConfigListResponseSerializer(serializers.Serializer):  # type: ignore[misc]
    name = serializers.CharField()
    version = serializers.IntegerField()


class ConfigCreateSerializer(serializers.Serializer):  # type: ignore[misc]
    name = serializers.CharField()
    content = serializers.JSONField()


class ConfigUpdateSerializer(serializers.Serializer):  # type: ignore[misc]
    content = serializers.JSONField()
    version = serializers.IntegerField(min_value=1)
