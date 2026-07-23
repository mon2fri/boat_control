from __future__ import annotations

from django.http import HttpResponse
from rest_framework.request import Request
from rest_framework.views import APIView

from apps.reports.serializers import ExportRequestSerializer
from apps.reports.services import export_excel, export_html
from apps.runs.persistence import load_run


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

        if run_id:
            loaded = load_run(run_id)
            if loaded is None:
                return HttpResponse(
                    f"Run {run_id} not found.", status=404, content_type="text/plain"
                )
            result_data = loaded.get("result", {})
            report_name = loaded.get("report_name", report_name)
            created_at = loaded.get("created_at")

        if result_data is None:
            return HttpResponse("No result data provided.", status=400, content_type="text/plain")

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
