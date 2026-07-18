from __future__ import annotations

from rest_framework import serializers  # type: ignore[import-untyped]


class SaveRunRequestSerializer(serializers.Serializer):  # type: ignore[misc]
    file_a_name = serializers.CharField()
    file_b_name = serializers.CharField()
    report_name = serializers.CharField(required=False, allow_null=True)


class RunMetadataSerializer(serializers.Serializer):  # type: ignore[misc]
    run_id = serializers.CharField()
    report_name = serializers.CharField()
    file_a_name = serializers.CharField()
    file_b_name = serializers.CharField()
    created_at = serializers.CharField()
    file_path = serializers.CharField()


class RenameRunRequestSerializer(serializers.Serializer):  # type: ignore[misc]
    report_name = serializers.CharField()
