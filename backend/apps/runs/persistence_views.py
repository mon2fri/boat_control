from __future__ import annotations

from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.runs.persistence import (
    delete_run,
    list_runs,
    load_run,
    rename_run,
)
from apps.runs.persistence_serializers import (
    RenameRunRequestSerializer,
    RunMetadataSerializer,
)
from apps.runs.tracking_context import parse_new_exceptions_only, resolve_run_document


class RunsListView(APIView):  # type: ignore[misc]
    def get(self, request: Request) -> Response:
        runs = list_runs()
        return Response(RunMetadataSerializer(runs, many=True).data)


class RunDetailView(APIView):  # type: ignore[misc]
    def get(self, request: Request, run_id: str) -> Response:
        data = load_run(run_id)
        if data is None:
            return Response({"error": f"Run {run_id} not found."}, status=404)
        try:
            stored_result = data.get("result")
            stored_scope = (
                bool(stored_result.get("new_exceptions_only", True))
                if isinstance(stored_result, dict)
                else True
            )
            requested = parse_new_exceptions_only(
                request.query_params.get("new_exceptions_only"),
                default=stored_scope,
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=400)
        return Response(
            resolve_run_document(
                data,
                new_exceptions_only=requested,
                refresh=True,
            )
        )

    def delete(self, request: Request, run_id: str) -> Response:
        try:
            delete_run(run_id)
        except ValueError as error:
            return Response({"error": str(error)}, status=404)
        return Response({"run_id": run_id, "deleted": True})


class RunRenameView(APIView):  # type: ignore[misc]
    def put(self, request: Request, run_id: str) -> Response:
        serializer = RenameRunRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            meta = rename_run(run_id, serializer.validated_data["report_name"])
            return Response(RunMetadataSerializer(meta).data)
        except ValueError as e:
            return Response({"error": str(e)}, status=404)
