"""HTTP endpoints for exception tracking and commentary exchange."""

from __future__ import annotations

import logging

from django.http import HttpResponse
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.exception_tracking import api_services
from apps.exception_tracking.dates import default_as_of_date
from apps.exception_tracking.serializers import (
    AsOfDateQuerySerializer,
    CommentaryTemplateImportSerializer,
    ExportQuerySerializer,
)
from apps.exception_tracking.table import (
    TableQueryError,
    available_filters,
    column_metadata,
    filter_records,
    normalize_query,
    parse_filters,
    sort_records,
    trim_detail_values,
)

logger = logging.getLogger(__name__)

_XLSX_CONTENT_TYPE = (
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)


def _error_response(exc: api_services.TrackingAPIError) -> Response:
    body: dict[str, object] = {"error": str(exc), "code": exc.code}
    if exc.details:
        body["details"] = exc.details
    return Response(body, status=exc.status_code)


def _unexpected_response(exc: Exception) -> Response:
    logger.exception("Exception tracking request failed", exc_info=exc)
    return Response(
        {
            "error": "An unexpected exception tracking error occurred.",
            "code": "tracking_internal_error",
        },
        status=500,
    )


class AvailableDatesView(APIView):  # type: ignore[misc]
    def get(self, request: Request) -> Response:
        try:
            dates = api_services.list_as_of_dates()
        except api_services.TrackingAPIError as exc:
            return _error_response(exc)
        except Exception as exc:  # pragma: no cover - defensive boundary
            return _unexpected_response(exc)
        return Response(
            {
                "dates": [value.isoformat() for value in dates],
                "default_as_of_date": default_as_of_date().isoformat(),
            }
        )


class ExceptionListView(APIView):  # type: ignore[misc]
    def get(self, request: Request) -> Response:
        serializer = AsOfDateQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        try:
            as_of_date = api_services.resolve_as_of_date(
                serializer.validated_data.get("as_of_date")
            )
            repository = api_services.get_repository()
            records = api_services.list_exceptions(as_of_date, repository)
            detail_columns = api_services.list_template_detail_columns(
                repository, as_of_date
            )
            offset, limit, sort_key, order = normalize_query(
                offset=request.query_params.get("offset"),
                limit=request.query_params.get("limit"),
                sort=request.query_params.get("sort"),
                order=request.query_params.get("order"),
                detail_columns=detail_columns,
            )
            filters = parse_filters(request.query_params, detail_columns)
        except TableQueryError as exc:
            return _error_response(
                api_services.TrackingAPIError(str(exc), code=exc.code)
            )
        except api_services.TrackingAPIError as exc:
            return _error_response(exc)
        except Exception as exc:  # pragma: no cover - defensive boundary
            return _unexpected_response(exc)

        filtered = filter_records(records, filters)
        ordered = sort_records(filtered, sort_key=sort_key, order=order)
        page = ordered[offset : offset + limit]
        return Response(
            {
                "as_of_date": as_of_date.isoformat(),
                "total": len(ordered),
                "unfiltered_total": len(records),
                "offset": offset,
                "limit": limit,
                "has_more": offset + len(page) < len(ordered),
                "sort": sort_key,
                "order": order,
                "filters": filters,
                "columns": column_metadata(detail_columns),
                "detail_columns": list(detail_columns),
                "exceptions": trim_detail_values(page, detail_columns),
                "available_filters": available_filters(records, detail_columns),
            }
        )


class CommentaryTemplateExportView(APIView):  # type: ignore[misc]
    def get(self, request: Request) -> HttpResponse | Response:
        serializer = ExportQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        try:
            # Report scope (run_id) exports exactly the persisted exceptions
            # captured by that run's enabled rules. Date scope (as_of_date or
            # default) exports all known exceptions for the selected date.
            # Both validation paths reject missing/invalid IDs and
            # contradictory arguments explicitly; a run export never falls
            # back to date-wide records.
            run_id = serializer.validated_data.get("run_id")
            if run_id:
                content, as_of_date = api_services.export_run_commentary(run_id)
            else:
                as_of_date = api_services.resolve_export_as_of_date(
                    as_of_date=serializer.validated_data.get("as_of_date"),
                )
                content = api_services.export_commentary(as_of_date)
        except api_services.TrackingAPIError as exc:
            return _error_response(exc)
        except Exception as exc:  # pragma: no cover - defensive boundary
            return _unexpected_response(exc)

        response = HttpResponse(content, content_type=_XLSX_CONTENT_TYPE)
        response["Content-Disposition"] = (
            f'attachment; filename="exception_commentary_{as_of_date.isoformat()}.xlsx"'
        )
        return response


class CommentaryTemplateImportView(APIView):  # type: ignore[misc]
    def post(self, request: Request) -> Response:
        serializer = CommentaryTemplateImportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        uploaded = serializer.validated_data["file"]
        try:
            content = uploaded.read()
            result = api_services.import_commentary(
                content,
                requested_as_of_date=serializer.validated_data.get("as_of_date"),
                run_id=serializer.validated_data.get("run_id"),
            )
        except api_services.TrackingAPIError as exc:
            return _error_response(exc)
        except OSError as exc:
            return _error_response(
                api_services.TrackingAPIError(
                    f"Could not read the uploaded workbook: {exc}",
                    code="invalid_workbook",
                )
            )
        except Exception as exc:  # pragma: no cover - defensive boundary
            return _unexpected_response(exc)
        return Response(result)
