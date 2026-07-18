from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.saved_filters.serializers import SavedFilterSerializer
from apps.saved_filters.services import (
    create_filter,
    delete_filter,
    list_filters,
    update_filter,
)


class SavedFilterListView(APIView):  # type: ignore[misc]

    def get(self, request: Request) -> Response:
        filters = list_filters()
        return Response([
            {
                "id": f.id,
                "name": f.name,
                "rows": [
                    {"column": r.column, "operator": r.operator, "filter_value": r.filter_value}
                    for r in f.rows
                ],
            }
            for f in filters
        ])

    def post(self, request: Request) -> Response:
        serializer = SavedFilterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        created = create_filter(
            name=serializer.validated_data["name"],
            rows=serializer.validated_data["rows"],
        )
        return Response(
            {
                "id": created.id,
                "name": created.name,
                "rows": [
                    {"column": r.column, "operator": r.operator, "filter_value": r.filter_value}
                    for r in created.rows
                ],
            },
            status=201,
        )


class SavedFilterDetailView(APIView):  # type: ignore[misc]

    def put(self, request: Request, filter_id: str) -> Response:
        serializer = SavedFilterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            updated = update_filter(
                filter_id=filter_id,
                name=serializer.validated_data["name"],
                rows=serializer.validated_data["rows"],
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=404)
        return Response({
            "id": updated.id,
            "name": updated.name,
            "rows": [
                {"column": r.column, "operator": r.operator, "filter_value": r.filter_value}
                for r in updated.rows
            ],
        })

    def delete(self, request: Request, filter_id: str) -> Response:
        try:
            delete_filter(filter_id)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=404)
        return Response(status=204)
