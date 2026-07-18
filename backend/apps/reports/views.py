from __future__ import annotations

from django.http import HttpResponse
from rest_framework.request import Request  # type: ignore[import-untyped]
from rest_framework.views import APIView  # type: ignore[import-untyped]

from apps.reports.serializers import ExportRequestSerializer
from apps.reports.services import export_csv, export_html
from apps.runs.persistence import load_run


class ExportView(APIView):  # type: ignore[misc]
    def post(self, request: Request) -> HttpResponse:
        serializer = ExportRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        run_id = data.get("run_id")
        result_data = data.get("result_data")
        report_name = data.get("report_name", "export")
        fmt = data["format"]

        if run_id:
            loaded = load_run(run_id)
            if loaded is None:
                return HttpResponse(
                    f"Run {run_id} not found.", status=404, content_type="text/plain"
                )
            result_data = loaded.get("result", {})
            report_name = loaded.get("report_name", report_name)

        if result_data is None:
            return HttpResponse("No result data provided.", status=400, content_type="text/plain")

        if fmt == "html":
            content = export_html(result_data, report_name)
            response = HttpResponse(content, content_type="text/html")
            response["Content-Disposition"] = f'attachment; filename="{report_name}.html"'
        else:
            content = export_csv(result_data, report_name)
            response = HttpResponse(content, content_type="text/csv")
            response["Content-Disposition"] = f'attachment; filename="{report_name}.csv"'

        return response
