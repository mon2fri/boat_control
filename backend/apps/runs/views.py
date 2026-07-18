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
        target_columns = request.data.get("target_columns")
        key_columns = request.data.get("key_columns")
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

        if not key_columns:
            key_columns = session.common_columns[:1]

        try:
            result = execute_comparison(
                path_a=path_a,
                path_b=path_b,
                target_columns=target_columns,
                key_columns=key_columns,
                filters=filters,
                rule_ids=rule_ids,
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
        )

        from apps.runs.persistence import load_run

        full_data = load_run(meta.run_id)
        return Response(full_data)
