from __future__ import annotations

import logging

import polars as pl
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.files.sessions import get_session

logger = logging.getLogger(__name__)


class ColumnValuesView(APIView):  # type: ignore[misc]

    def get(self, request: Request, session_id: str) -> Response:
        session = get_session(session_id)
        if session is None:
            return Response({"error": "Session not found or expired"}, status=404)

        column = request.query_params.get("column", "")
        if not column:
            return Response({"error": "column parameter is required"}, status=400)

        search = request.query_params.get("search", "")
        try:
            offset = max(0, int(request.query_params.get("offset", 0)))
            limit = max(1, min(500, int(request.query_params.get("limit", 100))))
        except ValueError:
            return Response({"error": "offset and limit must be integers"}, status=400)

        try:
            df_b = pl.scan_csv(session.file_b_path, infer_schema=False)

            if column not in df_b.columns:
                return Response({"error": f"Column '{column}' not found"}, status=400)

            vals_b = set(df_b.select(pl.col(column)).collect().get_column(column))
        except Exception:
            logger.exception("Failed to read column values")
            return Response(
                {"error": "Failed to read column values from CSV."}, status=500
            )

        all_values = vals_b
        if search:
            all_values = {v for v in all_values if search.lower() in str(v).lower()}

        sorted_values = sorted(all_values, key=str)
        total = len(sorted_values)
        start = offset
        end = start + limit
        page_values = sorted_values[start:end]

        values = []
        for v in page_values:
            sv = str(v)
            values.append({
                "value": sv,
                "in_file_a": False,
                "in_file_b": True,
                "display": sv,
            })

        has_more = end < total
        starred = False  # Values come from comparison file only; no star needed

        return Response({
            "session_id": session_id,
            "column": column,
            "values": values,
            "offset": offset,
            "total": total,
            "has_more": has_more,
            "starred_availability": starred,
            "search": search,
        })
