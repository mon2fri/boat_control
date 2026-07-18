from __future__ import annotations

from rest_framework import serializers  # type: ignore[import-untyped]


class ConditionSerializer(serializers.Serializer):  # type: ignore[misc]
    column_name = serializers.CharField()
    operator = serializers.ChoiceField(choices=["eq", "neq", "contains", "ncontains"])
    filter_value = serializers.CharField()


class LogicClauseSerializer(serializers.Serializer):  # type: ignore[misc]
    format = serializers.ChoiceField(choices=["value_vs_column", "column_vs_column"])
    column_name = serializers.CharField()
    operator = serializers.CharField()
    target_value = serializers.CharField()


class RuleSerializer(serializers.Serializer):  # type: ignore[misc]
    name = serializers.CharField()
    description = serializers.CharField(required=False, default="")
    conditions = ConditionSerializer(many=True, required=False, default=list)
    condition_relation = serializers.ChoiceField(
        choices=["and", "or"], required=False, allow_null=True
    )
    grouping = serializers.ListField(child=serializers.CharField(), required=False, allow_null=True)
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
    logic = LogicClauseSerializer()


class RulesListResponseSerializer(serializers.Serializer):  # type: ignore[misc]
    version = serializers.IntegerField()
    rules = RuleResponseSerializer(many=True)


class RemoteRulesRequestSerializer(serializers.Serializer):  # type: ignore[misc]
    url = serializers.URLField()
