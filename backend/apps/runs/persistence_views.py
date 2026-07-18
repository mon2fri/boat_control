from __future__ import annotations

from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.runs.persistence import (
    list_runs,
    load_run,
    rename_run,
)
from apps.runs.persistence_serializers import (
    RenameRunRequestSerializer,
    RunMetadataSerializer,
)


class RunsListView(APIView):  # type: ignore[misc]
    def get(self, request: Request) -> Response:
        runs = list_runs()
        return Response(RunMetadataSerializer(runs, many=True).data)


class RunDetailView(APIView):  # type: ignore[misc]
    def get(self, request: Request, run_id: str) -> Response:
        data = load_run(run_id)
        if data is None:
            return Response({"error": f"Run {run_id} not found."}, status=404)
        return Response(data)


class RunRenameView(APIView):  # type: ignore[misc]
    def put(self, request: Request, run_id: str) -> Response:
        serializer = RenameRunRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            meta = rename_run(run_id, serializer.validated_data["report_name"])
            return Response(RunMetadataSerializer(meta).data)
        except ValueError as e:
            return Response({"error": str(e)}, status=404)
