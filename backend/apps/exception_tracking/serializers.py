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
    run_id = serializers.CharField(required=False, allow_blank=False)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        # as_of_date and run_id may be combined; the service validates that
        # the workbook date matches both explicitly.
        return attrs

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


class RecertifyRequestSerializer(serializers.Serializer):  # type: ignore[misc]
    """Explicit acceptance of carried commentary for one as-of date.

    ``revision_tokens`` binds each selected exception ID to the server-issued
    ``revision_token`` from the list endpoint, so a stale confirmation cannot
    certify a newer rule revision. Missing tokens default to ``""`` (valid
    only for rows that were never carried). Acceptance of unchanged carried
    text is supported; blank text is never certified.
    """

    as_of_date = serializers.CharField()
    exception_ids = serializers.ListField(
        child=serializers.CharField(allow_blank=False),
        allow_empty=False,
    )
    revision_tokens = serializers.DictField(
        child=serializers.CharField(allow_blank=True),
        required=False,
        default=dict,
    )

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        tokens = attrs.get("revision_tokens") or {}
        for exception_id in attrs.get("exception_ids", []):
            tokens.setdefault(str(exception_id), "")
        attrs["revision_tokens"] = {str(key): str(value) for key, value in tokens.items()}
        attrs["exception_ids"] = [str(value) for value in attrs.get("exception_ids", [])]
        return attrs
