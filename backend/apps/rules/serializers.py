from __future__ import annotations

from rest_framework import serializers


class ConditionSerializer(serializers.Serializer):  # type: ignore[misc]
    column_name = serializers.CharField()
    operator = serializers.ChoiceField(choices=["eq", "neq", "contains", "ncontains", "gt", "lt"])
    filter_value = serializers.CharField(required=False, allow_blank=True, default="")
    filter_values = serializers.ListField(
        child=serializers.CharField(allow_blank=False), required=False
    )

    def validate(self, attrs):  # type: ignore[no-untyped-def]
        values = attrs.get("filter_values")
        if values is None:
            legacy = attrs.get("filter_value", "")
            values = [legacy] if legacy else []
        if not values:
            raise serializers.ValidationError("At least one condition value is required.")
        attrs["filter_values"] = values
        attrs["filter_value"] = values[0]
        return attrs


class LogicClauseSerializer(serializers.Serializer):  # type: ignore[misc]
    format = serializers.ChoiceField(choices=["value_vs_column", "column_vs_column"])
    column_name = serializers.CharField()
    operator = serializers.ChoiceField(
        choices=["eq", "neq", "contains", "ncontains", "gt", "lt", "gte", "lte"]
    )
    target_value = serializers.CharField()
    target_values = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )


class RuleSerializer(serializers.Serializer):  # type: ignore[misc]
    name = serializers.CharField()
    description = serializers.CharField(required=False, default="")
    conditions = ConditionSerializer(many=True, required=False, default=list)
    condition_relation = serializers.ChoiceField(
        choices=["and", "or"], required=False, allow_null=True
    )
    grouping = serializers.ListField(child=serializers.CharField(), required=False, allow_null=True)
    grouping_tree = serializers.JSONField(required=False, allow_null=True)
    logic = LogicClauseSerializer()


class RuleResponseSerializer(serializers.Serializer):  # type: ignore[misc]
    rule_id = serializers.CharField()
    name = serializers.CharField()
    description = serializers.CharField()
    conditions = ConditionSerializer(many=True)
    condition_relation = serializers.ChoiceField(
        choices=["and", "or"], required=False, allow_null=True
    )
    grouping = serializers.ListField(child=serializers.CharField(), required=False, allow_null=True)
    grouping_tree = serializers.JSONField(required=False, allow_null=True)
    logic = LogicClauseSerializer()


class RulesListResponseSerializer(serializers.Serializer):  # type: ignore[misc]
    version = serializers.IntegerField()
    rules = RuleResponseSerializer(many=True)
