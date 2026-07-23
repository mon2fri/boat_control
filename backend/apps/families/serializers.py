from rest_framework import serializers


class ValueFamilyOwnerSerializer(serializers.Serializer):  # type: ignore[misc]
    kind = serializers.ChoiceField(choices=["column", "column_family"])
    name = serializers.CharField()


class FamilySerializer(serializers.Serializer):  # type: ignore[misc]
    kind = serializers.ChoiceField(choices=["column", "value"])
    name = serializers.CharField()
    columns = serializers.ListField(
        child=serializers.CharField(), required=False
    )
    owners = ValueFamilyOwnerSerializer(many=True, required=False)
    values = serializers.ListField(
        child=serializers.CharField(), required=False
    )


class FamilyCreateSerializer(serializers.Serializer):  # type: ignore[misc]
    kind = serializers.ChoiceField(choices=["column", "value"])
    name = serializers.CharField()
    columns = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )
    owners = ValueFamilyOwnerSerializer(many=True, required=False)
    values = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )


class FamilyUpdateSerializer(serializers.Serializer):  # type: ignore[misc]
    kind = serializers.ChoiceField(choices=["column", "value"])
    name = serializers.CharField(required=False)
    columns = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )
    owners = ValueFamilyOwnerSerializer(many=True, required=False)
    values = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )
    version = serializers.IntegerField(min_value=1)
