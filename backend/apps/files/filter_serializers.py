from __future__ import annotations

from dataclasses import asdict
from typing import Any

from rest_framework import serializers

from apps.files.filter_services import FilterPreparationResult


class FilterPreparationRequestSerializer(serializers.Serializer):  # type: ignore[misc]
    file_a_path = serializers.CharField()
    file_b_path = serializers.CharField()
    common_columns = serializers.ListField(child=serializers.CharField())


class ColumnValueSerializer(serializers.Serializer):  # type: ignore[misc]
    value = serializers.CharField()
    in_file_a = serializers.BooleanField()
    in_file_b = serializers.BooleanField()
    display = serializers.CharField()


class FilterPreparationResponseSerializer(serializers.Serializer):  # type: ignore[misc]
    columns = serializers.ListField(child=serializers.CharField())
    column_values = serializers.DictField(
        child=serializers.ListField(child=ColumnValueSerializer())
    )
    total_rows_a = serializers.IntegerField()
    total_rows_b = serializers.IntegerField()
    requires_confirmation = serializers.BooleanField()

    @classmethod
    def from_result(cls, result: FilterPreparationResult) -> dict[str, Any]:
        data = asdict(result)
        return data


class FilterValidationRequestSerializer(serializers.Serializer):  # type: ignore[misc]
    column = serializers.CharField()
    operator = serializers.CharField()
    filter_value = serializers.CharField(required=False, allow_blank=True)
    filter_values = serializers.ListField(
        child=serializers.CharField(), required=False, allow_empty=True
    )
    common_columns = serializers.ListField(child=serializers.CharField())


class TargetColumnsRequestSerializer(serializers.Serializer):  # type: ignore[misc]
    target_columns = serializers.ListField(
        child=serializers.CharField(), required=False, allow_null=True
    )
    common_columns = serializers.ListField(child=serializers.CharField())


class TargetColumnsInputSerializer(serializers.Serializer):  # type: ignore[misc]
    input_str = serializers.CharField()
    common_columns = serializers.ListField(child=serializers.CharField())
