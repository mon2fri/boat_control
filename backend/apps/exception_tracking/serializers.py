"""Request validation for exception-tracking endpoints."""

from __future__ import annotations

from typing import Any

from rest_framework import serializers

from apps.exception_tracking.workbook import MAX_TEMPLATE_BYTES


class AsOfDateQuerySerializer(serializers.Serializer):  # type: ignore[misc]
    as_of_date = serializers.CharField(required=False, allow_blank=False)


class ExportQuerySerializer(serializers.Serializer):  # type: ignore[misc]
    as_of_date = serializers.CharField(required=False, allow_blank=False)
    run_id = serializers.CharField(required=False, allow_blank=False)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if attrs.get("as_of_date") and attrs.get("run_id"):
            raise serializers.ValidationError(
                "Provide either as_of_date or run_id, not both."
            )
        return attrs


class CommentaryTemplateImportSerializer(serializers.Serializer):  # type: ignore[misc]
    file = serializers.FileField()
    as_of_date = serializers.CharField(required=False, allow_blank=False)

    def validate_file(self, value: Any) -> Any:
        name = str(getattr(value, "name", ""))
        if not name.lower().endswith(".xlsx"):
            raise serializers.ValidationError("The commentary template must be an .xlsx file.")
        size = getattr(value, "size", None)
        if size is not None and size > MAX_TEMPLATE_BYTES:
            limit_mib = MAX_TEMPLATE_BYTES // (1024 * 1024)
            raise serializers.ValidationError(
                f"The commentary template exceeds the {limit_mib} MiB limit."
            )
        return value
