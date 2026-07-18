from __future__ import annotations

from dataclasses import asdict
from typing import Any

from rest_framework import serializers

from apps.files.services import HeaderInspectionResult


class FileUploadSerializer(serializers.Serializer):  # type: ignore[misc]
    file_a = serializers.FileField()
    file_b = serializers.FileField()

    def validate_file_a(self, value: Any) -> Any:
        return self._validate_csv(value, "file_a")

    def validate_file_b(self, value: Any) -> Any:
        return self._validate_csv(value, "file_b")

    def _validate_csv(self, value: Any, label: str) -> Any:
        if not value.name.lower().endswith(".csv"):
            raise serializers.ValidationError(f"{label} must be a CSV file.")
        if value.size and value.size > 500 * 1024 * 1024:
            raise serializers.ValidationError(f"{label} exceeds 500 MB limit.")
        return value


class HeaderInspectionResponseSerializer(serializers.Serializer):  # type: ignore[misc]
    file_a_name = serializers.CharField()
    file_b_name = serializers.CharField()
    columns_a = serializers.ListField(child=serializers.CharField())
    columns_b = serializers.ListField(child=serializers.CharField())
    common_columns = serializers.ListField(child=serializers.CharField())
    only_in_a = serializers.ListField(child=serializers.CharField())
    only_in_b = serializers.ListField(child=serializers.CharField())

    @classmethod
    def from_result(cls, result: HeaderInspectionResult) -> dict[str, object]:
        return asdict(result)
