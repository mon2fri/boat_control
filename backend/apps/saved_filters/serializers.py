from rest_framework import serializers


class FilterRowSerializer(serializers.Serializer):  # type: ignore[misc]
    column = serializers.CharField()
    operator = serializers.ChoiceField(choices=["eq", "neq", "contains", "ncontains"])
    filter_value = serializers.CharField()


class SavedFilterSerializer(serializers.Serializer):  # type: ignore[misc]
    name = serializers.CharField()
    rows = FilterRowSerializer(many=True)
