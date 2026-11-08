from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.runs.grouped_logic import serialize_grouping_tree
from apps.saved_filters.serializers import SavedFilterSerializer
from apps.saved_filters.services import (
    SavedFilter,
    create_filter,
    delete_filter,
    list_filters,
    update_filter,
)


def _filter_payload(saved: SavedFilter) -> dict[str, object]:
    payload: dict[str, object] = {
        "id": saved.id,
        "name": saved.name,
        "rows": [
            {
                "column": row.column,
                "operator": row.operator,
                "filter_value": row.filter_value,
                "filter_values": list(row.filter_values or [row.filter_value]),
            }
            for row in saved.rows
        ],
    }
    if saved.filter_relation is not None:
        payload["filter_relation"] = saved.filter_relation
    tree = serialize_grouping_tree(saved.filter_grouping_tree)
    if tree is not None:
        payload["filter_grouping_tree"] = tree
    return payload


class SavedFilterListView(APIView):  # type: ignore[misc]

    def get(self, request: Request) -> Response:
        return Response([_filter_payload(saved) for saved in list_filters()])

    def post(self, request: Request) -> Response:
        serializer = SavedFilterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            created = create_filter(
                name=serializer.validated_data["name"],
                rows=serializer.validated_data["rows"],
                filter_relation=serializer.validated_data.get("filter_relation"),
                filter_grouping_tree=serializer.validated_data.get(
                    "filter_grouping_tree"
                ),
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=400)
        return Response(_filter_payload(created), status=201)


class SavedFilterDetailView(APIView):  # type: ignore[misc]

    def put(self, request: Request, filter_id: str) -> Response:
        serializer = SavedFilterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            updated = update_filter(
                filter_id=filter_id,
                name=serializer.validated_data["name"],
                rows=serializer.validated_data["rows"],
                filter_relation=serializer.validated_data.get("filter_relation"),
                filter_grouping_tree=serializer.validated_data.get(
                    "filter_grouping_tree"
                ),
            )
        except ValueError as exc:
            status = 404 if "not found" in str(exc) else 400
            return Response({"error": str(exc)}, status=status)
        return Response(_filter_payload(updated))

    def delete(self, request: Request, filter_id: str) -> Response:
        try:
            delete_filter(filter_id)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=404)
        return Response(status=204)
