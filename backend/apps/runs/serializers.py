from __future__ import annotations

from rest_framework import serializers  # type: ignore[import-untyped]


class FilterSerializer(serializers.Serializer):  # type: ignore[misc]
    column = serializers.CharField()
    operator = serializers.ChoiceField(choices=["eq", "neq", "contains", "ncontains"])
    filter_value = serializers.CharField()


class ExecuteComparisonRequestSerializer(serializers.Serializer):  # type: ignore[misc]
    file_a_path = serializers.CharField()
    file_b_path = serializers.CharField()
    target_columns = serializers.ListField(
        child=serializers.CharField(), required=False, allow_null=True
    )
    filters = FilterSerializer(many=True, required=False, default=list)
    rule_ids = serializers.ListField(child=serializers.CharField(), required=False, allow_null=True)


class AttributeChangeSerializer(serializers.Serializer):  # type: ignore[misc]
    column = serializers.CharField()
    file_a_value = serializers.JSONField()
    file_b_value = serializers.JSONField()


class RowComparisonSerializer(serializers.Serializer):  # type: ignore[misc]
    row_index = serializers.IntegerField()
    key_columns = serializers.DictField(child=serializers.JSONField())
    attribute_changes = AttributeChangeSerializer(many=True)
    change_count = serializers.IntegerField()


class ComparisonResultSerializer(serializers.Serializer):  # type: ignore[misc]
    total_rows_a = serializers.IntegerField()
    total_rows_b = serializers.IntegerField()
    rows_with_changes = serializers.IntegerField()
    total_attribute_changes = serializers.IntegerField()
    row_details = RowComparisonSerializer(many=True)


class ValidationViolationSerializer(serializers.Serializer):  # type: ignore[misc]
    row_index = serializers.IntegerField()
    rule_id = serializers.CharField()
    rule_name = serializers.CharField()
    key_columns = serializers.DictField(child=serializers.JSONField())
    details = serializers.CharField()


class ValidationResultSerializer(serializers.Serializer):  # type: ignore[misc]
    total_violations = serializers.IntegerField()
    violations_by_rule = serializers.DictField(
        child=serializers.ListField(child=ValidationViolationSerializer())
    )
    violation_count_by_rule = serializers.DictField(child=serializers.IntegerField())


class ExecutionResultSerializer(serializers.Serializer):  # type: ignore[misc]
    comparison = ComparisonResultSerializer()
    validation = ValidationResultSerializer()
    common_columns = serializers.ListField(child=serializers.CharField())
    target_columns = serializers.ListField(child=serializers.CharField())
    filters_applied = FilterSerializer(many=True)
