from __future__ import annotations

from collections import defaultdict

from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.runs.persistence import load_run


def _flatten_rows(result: dict, section: str) -> list[dict]:
    """Flatten stored result rows into a uniform list for filtering/pagination."""
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
        return rows

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
                    "file_a_value": v.get("comparison_value"),
                    "file_b_value": v.get("violating_value"),
                    "violating_column": v.get("violating_column", ""),
                    "violating_value": v.get("violating_value"),
                    "logic_comparison_value": v.get("logic_comparison_value"),
                }
            )
    return rows


def _apply_detail_filters(
    rows: list[dict], filters: dict[str, list[str]]
) -> list[dict]:
    """Filter rows by key_<col> and column params (AND across fields, OR within)."""
    if not filters:
        return rows
    result = rows
    for field, values in filters.items():
        if not values:
            continue
        value_set = set(values)
        if field == "column":
            result = [r for r in result if r.get("column") in value_set]
        elif field.startswith("key_"):
            col = field[4:]
            result = [
                r for r in result
                if r.get("key_columns", {}).get(col) in value_set
            ]
    return result


def _compute_facets(rows: list[dict], key_columns: list[str]) -> dict[str, list[str]]:
    """Compute distinct available values for each filterable field."""
    facets: dict[str, set[str]] = defaultdict(set)
    for r in rows:
        for kc in key_columns:
            val = r.get("key_columns", {}).get(kc)
            if val is not None:
                facets[f"key_{kc}"].add(str(val))
        col = r.get("column")
        if col is not None:
            facets["column"].add(str(col))
    return {k: sorted(v) for k, v in facets.items()}


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
        key_columns = result.get("key_columns", [])

        all_rows = _flatten_rows(result, section)

        # Compute facets from complete unfiltered data
        facets = _compute_facets(all_rows, key_columns)

        # Parse filter params: key_<col>=val1,val2, column=val1,val2
        detail_filters: dict[str, list[str]] = {}
        for param_key in request.query_params:
            if param_key in ("section", "offset", "limit"):
                continue
            raw = request.query_params.get(param_key, "")
            values = [v.strip() for v in raw.split(",") if v.strip()]
            if values:
                detail_filters[param_key] = values

        filtered_rows = _apply_detail_filters(all_rows, detail_filters)

        total = len(filtered_rows)
        start = offset
        end = start + limit
        page_rows = filtered_rows[start:end]

        return Response(
            {
                "run_id": run_id,
                "section": section,
                "offset": offset,
                "total": total,
                "has_more": end < total,
                "details": page_rows,
                "available_filters": facets,
            }
        )
