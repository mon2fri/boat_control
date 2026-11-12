from rest_framework import serializers


class FilterRowSerializer(serializers.Serializer):  # type: ignore[misc]
    column = serializers.CharField()
    operator = serializers.ChoiceField(choices=["eq", "neq", "contains", "ncontains"])
    filter_value = serializers.CharField(required=False, allow_blank=True, default="")
    filter_values = serializers.ListField(
        child=serializers.CharField(allow_blank=False),
        required=False,
        allow_empty=True,
        default=list,
    )


class SavedFilterSerializer(serializers.Serializer):  # type: ignore[misc]
    name = serializers.CharField()
    rows = FilterRowSerializer(many=True)
    filter_relation = serializers.ChoiceField(
        choices=["and", "or"], required=False, allow_null=True
    )
    filter_grouping_tree = serializers.JSONField(required=False, allow_null=True)
