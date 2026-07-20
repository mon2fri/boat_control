from __future__ import annotations

from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.runs.persistence import load_run


class RunPaginatedDetailView(APIView):  # type: ignore[misc]
    def get(self, request: Request, run_id: str) -> Response:
        run_data = load_run(run_id)
        if run_data is None:
            return Response({"error": "Run not found"}, status=404)

        section = request.query_params.get("section", "")
        if section not in ("changes", "violations"):
            return Response(
                {"error": "section parameter must be 'changes' or 'violations'"},
                status=400,
            )

        try:
            offset = max(0, int(request.query_params.get("offset", 0)))
            limit = max(1, min(1000, int(request.query_params.get("limit", 100))))
        except ValueError:
            return Response({"error": "offset and limit must be integers"}, status=400)

        result = run_data.get("result", {})
        comparison = result.get("comparison", {})
        validation = result.get("validation", {})

        if section == "changes":
            raw_rows = comparison.get("row_details", [])
            rows = []
            for r in raw_rows:
                key_cols = r.get("key_columns", {})
                for change in r.get("attribute_changes", []):
                    rows.append(
                        {
                            "row_key": ",".join(f"{k}={v}" for k, v in key_cols.items())
                            or str(r.get("row_index", "")),
                            "key_columns": key_cols,
                            "column": change["column"],
                            "file_a_value": change.get("file_a_value"),
                            "file_b_value": change.get("file_b_value"),
                        }
                    )
        else:
            raw_violations = validation.get("violations_by_rule", {})
            rows = []
            for _rule_id, violations in raw_violations.items():
                for v in violations:
                    key_cols = v.get("key_columns", {})
                    rows.append(
                        {
                            "row_key": ",".join(f"{k}={kv}" for k, kv in key_cols.items())
                            or str(v.get("row_index", "")),
                            "key_columns": key_cols,
                            "column": v.get("violating_column", ""),
                            "file_a_value": v.get("violating_value"),
                            "file_b_value": v.get("comparison_value"),
                            "violating_column": v.get("violating_column", ""),
                            "violating_value": v.get("violating_value"),
                        }
                    )

        total = len(rows)
        start = offset
        end = start + limit
        page_rows = rows[start:end]

        return Response(
            {
                "run_id": run_id,
                "section": section,
                "offset": offset,
                "total": total,
                "has_more": end < total,
                "details": page_rows,
            }
        )
