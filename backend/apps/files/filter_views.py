from __future__ import annotations

from pathlib import Path

from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.files.filter_services import (
    parse_target_columns,
    prepare_filters,
    validate_filter,
    validate_target_columns,
)
from apps.files.sessions import get_session


class FilterPreparationView(APIView):  # type: ignore[misc]
    def post(self, request: Request) -> Response:
        session_id = request.data.get("session_id")

        if not session_id:
            return Response(
                {"error": "session_id is required."}, status=400
            )

        session = get_session(session_id)
        if not session:
            return Response(
                {"error": "Session not found or expired."}, status=404
            )

        # Use the caller-provided comparison columns; fall back to the
        # session's raw common columns for backward compatibility.
        common_columns = request.data.get("common_columns") or session.common_columns
        path_a = Path(session.file_a_path)
        path_b = Path(session.file_b_path)

        result = prepare_filters(path_a, path_b, common_columns)
        return Response({
            "session_id": session.session_id,
            "columns": result.columns,
            "column_values": {
                col: [
                    {
                        "value": v.value,
                        "in_file_a": v.in_file_a,
                        "in_file_b": v.in_file_b,
                        "display": v.display,
                    }
                    for v in values
                ]
                for col, values in result.column_values.items()
            },
            "total_rows_a": result.total_rows_a,
            "total_rows_b": result.total_rows_b,
            "requires_confirmation": result.requires_confirmation,
        })


class FilterValidationView(APIView):  # type: ignore[misc]
    def post(self, request: Request) -> Response:
        session_id = request.data.get("session_id")
        column = request.data.get("column")
        operator = request.data.get("operator")
        # Support both legacy filter_value (string) and new filter_values (array)
        filter_values = request.data.get("filter_values", [])
        filter_value = request.data.get("filter_value", "")
        if not filter_values and filter_value:
            filter_values = [filter_value]

        if not all([session_id, column, operator]) or not filter_values:
            return Response(
                {"error": "All fields are required."}, status=400
            )

        session = get_session(session_id)
        if not session:
            return Response(
                {"error": "Session not found or expired."}, status=404
            )

        common_columns = request.data.get("common_columns") or session.common_columns
        # Validate each value in the array
        all_valid = True
        all_errors: list[str] = []
        for val in filter_values:
            result = validate_filter(column, operator, val, common_columns)
            if not result.valid:
                all_valid = False
                all_errors.extend(result.errors)
        return Response({"valid": all_valid, "errors": all_errors})


class TargetColumnsView(APIView):  # type: ignore[misc]
    def post(self, request: Request) -> Response:
        session_id = request.data.get("session_id")
        target_columns = request.data.get("target_columns")

        if not session_id:
            return Response({"error": "session_id is required."}, status=400)

        session = get_session(session_id)
        if not session:
            return Response({"error": "Session not found or expired."}, status=404)

        common_columns = request.data.get("common_columns") or session.common_columns
        result = validate_target_columns(target_columns, common_columns)
        return Response({
            "session_id": session.session_id,
            "valid_columns": result.valid_columns,
            "invalid_columns": result.invalid_columns,
            "all_common_columns": result.all_common_columns,
        })


class TargetColumnsInputView(APIView):  # type: ignore[misc]
    def post(self, request: Request) -> Response:
        session_id = request.data.get("session_id")
        input_str = request.data.get("input_str", "")

        if not session_id:
            return Response({"error": "session_id is required."}, status=400)

        session = get_session(session_id)
        if not session:
            return Response({"error": "Session not found or expired."}, status=404)

        common_columns = request.data.get("common_columns") or session.common_columns
        columns = parse_target_columns(input_str)
        result = validate_target_columns(columns, common_columns)
        return Response({
            "session_id": session.session_id,
            "parsed_columns": columns,
            "valid_columns": result.valid_columns,
            "invalid_columns": result.invalid_columns,
        })
