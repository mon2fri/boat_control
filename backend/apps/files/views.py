from __future__ import annotations

import logging
from pathlib import Path

from rest_framework.request import Request  # type: ignore[import-untyped]
from rest_framework.response import Response  # type: ignore[import-untyped]
from rest_framework.views import APIView  # type: ignore[import-untyped]

from apps.files.services import inspect_headers, safe_upload_path
from apps.files.sessions import create_session, get_session

logger = logging.getLogger(__name__)


class FileUploadView(APIView):  # type: ignore[misc]
    def post(self, request: Request) -> Response:
        file_a = request.FILES.get("file_a")
        file_b = request.FILES.get("file_b")

        if not file_a or not file_b:
            return Response(
                {"error": "Both file_a and file_b are required."}, status=400
            )

        if not file_a.name.lower().endswith(".csv"):
            return Response({"error": "file_a must be a CSV file."}, status=400)
        if not file_b.name.lower().endswith(".csv"):
            return Response({"error": "file_b must be a CSV file."}, status=400)

        max_size = 500 * 1024 * 1024
        if file_a.size and file_a.size > max_size:
            return Response({"error": "file_a exceeds 500 MB limit."}, status=400)
        if file_b.size and file_b.size > max_size:
            return Response({"error": "file_b exceeds 500 MB limit."}, status=400)

        path_a = safe_upload_path(file_a.name)
        path_b = safe_upload_path(file_b.name)

        self._write_file(file_a, path_a)
        self._write_file(file_b, path_b)

        try:
            result = inspect_headers(
                path_a, file_a.name, path_b, file_b.name
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=400)
        except Exception:
            logger.exception("Header inspection failed")
            return Response(
                {"error": "Failed to inspect CSV headers."}, status=500
            )

        session = create_session(
            file_a_path=path_a,
            file_b_path=path_b,
            file_a_name=file_a.name,
            file_b_name=file_b.name,
            common_columns=result.common_columns,
            columns_a=result.columns_a,
            columns_b=result.columns_b,
            only_in_a=result.only_in_a,
            only_in_b=result.only_in_b,
        )

        return Response({
            "session_id": session.session_id,
            "file_a_name": session.file_a_name,
            "file_b_name": session.file_b_name,
            "inspection": {
                "columns_a": result.columns_a,
                "columns_b": result.columns_b,
                "common_columns": result.common_columns,
                "only_in_a": result.only_in_a,
                "only_in_b": result.only_in_b,
            },
        })

    def _write_file(self, uploaded_file, path: Path) -> None:  # type: ignore[no-untyped-def]
        with open(path, "wb") as f:
            for chunk in uploaded_file.chunks():
                f.write(chunk)


class HeaderInspectionView(APIView):  # type: ignore[misc]
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

        try:
            result = inspect_headers(
                Path(session.file_a_path),
                session.file_a_name,
                Path(session.file_b_path),
                session.file_b_name,
            )
        except Exception:
            logger.exception("Header reinspection failed")
            return Response(
                {"error": "Failed to inspect CSV headers."}, status=500
            )

        return Response({
            "session_id": session.session_id,
            "inspection": {
                "columns_a": result.columns_a,
                "columns_b": result.columns_b,
                "common_columns": result.common_columns,
                "only_in_a": result.only_in_a,
                "only_in_b": result.only_in_b,
            },
        })
