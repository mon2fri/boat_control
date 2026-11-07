from __future__ import annotations

from django.http import HttpResponse
from rest_framework.request import Request
from rest_framework.views import APIView

from apps.reports.serializers import ExportRequestSerializer
from apps.reports.services import export_excel, export_html
from apps.runs.persistence import load_run
from apps.runs.tracking_context import (
    filter_result_for_new_exceptions,
    resolve_run_document,
)


class ExportView(APIView):  # type: ignore[misc]
    def post(self, request: Request) -> HttpResponse:
        serializer = ExportRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        run_id = data.get("run_id")
        result_data = data.get("result_data")
        report_name = data.get("report_name", "export")
        created_at = None
        fmt = data["format"]
        requested_scope = data.get("new_exceptions_only")

        if run_id:
            loaded = load_run(run_id)
            if loaded is None:
                return HttpResponse(
                    f"Run {run_id} not found.", status=404, content_type="text/plain"
                )
            stored_scope = bool(
                (loaded.get("result") or {}).get("new_exceptions_only", True)
            )
            effective_scope = (
                requested_scope if requested_scope is not None else stored_scope
            )
            viewed = resolve_run_document(
                loaded,
                new_exceptions_only=effective_scope,
                refresh=True,
            )
            result_data = viewed.get("result", {})
            report_name = loaded.get("report_name", report_name)
            created_at = loaded.get("created_at")
        elif result_data is not None:
            if not isinstance(result_data, dict):
                return HttpResponse(
                    "No result data provided.", status=400, content_type="text/plain"
                )
            effective_scope = (
                requested_scope
                if requested_scope is not None
                else bool(result_data.get("new_exceptions_only", True))
            )
            result_data = filter_result_for_new_exceptions(
                result_data, effective_scope
            )

        if result_data is None:
            return HttpResponse("No result data provided.", status=400, content_type="text/plain")

        content: str | bytes
        if fmt == "html":
            content = export_html(result_data, report_name, created_at)
            response = HttpResponse(content, content_type="text/html")
            response["Content-Disposition"] = f'attachment; filename="{report_name}.html"'
        else:
            try:
                content = export_excel(result_data, report_name)
            except ValueError as error:
                return HttpResponse(str(error), status=400, content_type="text/plain")
            response = HttpResponse(
                content,
                content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
            response["Content-Disposition"] = f'attachment; filename="{report_name}.xlsx"'

        return response
