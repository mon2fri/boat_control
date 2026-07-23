from __future__ import annotations

from rest_framework import serializers


class ExportRequestSerializer(serializers.Serializer):  # type: ignore[misc]
    run_id = serializers.CharField(required=False, allow_null=True)
    result_data = serializers.JSONField(required=False, allow_null=True)
    report_name = serializers.CharField(required=False, default="export")
    format = serializers.ChoiceField(choices=["html", "excel"])
