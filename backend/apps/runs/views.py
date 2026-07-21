from __future__ import annotations

import logging
from pathlib import Path

from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.files.sessions import get_session
from apps.runs.persistence import save_run
from apps.runs.services import execute_comparison

logger = logging.getLogger(__name__)

_ERROR_MAP: dict[type, tuple[int, str | None]] = {
    FileNotFoundError: (404, "Upload files no longer available. Please re-upload."),
    ValueError: (400, None),
    KeyError: (400, "Invalid request data."),
    IndexError: (400, "Invalid request data."),
}


class ExecuteComparisonView(APIView):  # type: ignore[misc]
    def post(self, request: Request) -> Response:
        session_id = request.data.get("session_id")
        comparison_columns = request.data.get("comparison_columns")
        target_columns = request.data.get("target_columns")
        key_columns = request.data.get("key_columns")
        grouping_columns = request.data.get("grouping_columns", [])
        filters = request.data.get("filters", [])
        rule_ids = request.data.get("rule_ids")

        if not session_id:
            return Response(
                {"error": "session_id is required."}, status=400
            )

        session = get_session(session_id)
        if not session:
            return Response(
                {"error": "Session not found or expired."}, status=404
            )

        path_a = Path(session.file_a_path)
        path_b = Path(session.file_b_path)

        if not path_a.exists() or not path_b.exists():
            return Response(
                {"error": "Upload files no longer available. Please re-upload."},
                status=404,
            )

        # Use the user's comparison-column selection as the effective
        # common set; fall back to the session's raw common columns when
        # the client omits the field (backward compat).
        if not comparison_columns:
            comparison_columns = session.common_columns
        else:
            # Validate comparison_columns is a non-empty subset of session.common_columns
            common_set = set(session.common_columns)
            invalid = [c for c in comparison_columns if c not in common_set]
            if invalid:
                return Response(
                    {"error": f"Invalid comparison columns: {', '.join(invalid)}"},
                    status=400,
                )

        # Validate grouping_columns: each must be a unique member of comparison_columns
        if grouping_columns:
            comp_set = set(comparison_columns)
            dupes = [c for c in grouping_columns if grouping_columns.count(c) > 1]
            if dupes:
                return Response(
                    {"error": f"Duplicate grouping columns: {', '.join(set(dupes))}"},
                    status=400,
                )
            invalid_gc = [c for c in grouping_columns if c not in comp_set]
            if invalid_gc:
                return Response(
                    {"error": f"Invalid grouping columns: {', '.join(invalid_gc)}"},
                    status=400,
                )

        if not key_columns:
            return Response(
                {"error": "key_columns is required. Select at least one identifier column."},
                status=400,
            )

        try:
            result = execute_comparison(
                path_a=path_a,
                path_b=path_b,
                comparison_columns=comparison_columns,
                target_columns=target_columns,
                key_columns=key_columns,
                filters=filters,
                rule_ids=rule_ids,
                grouping_columns=grouping_columns,
            )
        except Exception as exc:
            logger.warning("execute_comparison failed: %s", exc)
            for exc_type, (status, message) in _ERROR_MAP.items():
                if isinstance(exc, exc_type):
                    body = message or str(exc)
                    return Response({"error": body}, status=status)
            return Response(
                {"error": "An internal error occurred."}, status=500
            )

        meta = save_run(
            result=result,
            file_a_name=session.file_a_name,
            file_b_name=session.file_b_name,
            file_a_path=path_a,
            file_b_path=path_b,
        )

        from apps.runs.persistence import load_run

        full_data = load_run(meta.run_id)
        return Response(full_data)
