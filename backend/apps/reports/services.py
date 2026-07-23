from __future__ import annotations

import csv
import html
import io
from datetime import datetime
from typing import Any

_FILTER_OP_LABELS: dict[str, str] = {
    "equals": "equals",
    "not_equals": "not equal to",
    "contains": "contains",
    "not_contains": "does not contain",
    "eq": "equals",
    "neq": "not equal to",
    "ncontains": "does not contain",
}


def _escape_html(value: Any) -> str:
    if value is None:
        return ""
    return html.escape(str(value))


def _sanitize_csv_value(value: Any) -> str:
    if value is None:
        return ""
    str_val = str(value)
    if str_val and str_val[0] in ("=", "+", "-", "@", "\t", "\r"):
        str_val = f"'{str_val}"
    return str_val


def _humanize_rule_logic(value: Any) -> str:
    text = str(value or "")
    replacements = (
        ("ncontains", "does not contain"),
        ("contains", "contains"),
        ("neq", "does not equal"),
        ("gte", "greater than or equal to"),
        ("lte", "less than or equal to"),
        ("gt", "greater than"),
        ("lt", "less than"),
        ("eq", "equals"),
    )
    for operator, wording in replacements:
        text = text.replace(f" {operator} ", f" {wording} ")
    return text


def _metric(label: str, value: Any) -> str:
    return (
        f"<div class='metric'><b>{_escape_html(value)}</b><span>{_escape_html(label)}</span></div>"
    )


def _detail_header(key_columns: list[str]) -> str:
    identity = "".join(f"<th>{_escape_html(column)}</th>" for column in key_columns)
    if not identity:
        identity = "<th>Row</th>"
    return (
        f"<tr>{identity}<th>Column</th><th>In Baseline</th>"
        "<th>In Comparison</th><th>Rationale</th></tr>"
    )


def _identity_cells(key_columns: list[str], key_values: dict[str, Any], row_index: Any) -> str:
    if key_columns:
        return "".join(
            f"<td>{_escape_html(key_values.get(column, '—'))}</td>" for column in key_columns
        )
    return f"<td>{_escape_html(row_index)}</td>"


def _format_filter_row(f: dict[str, Any]) -> str:
    op = _FILTER_OP_LABELS.get(f.get("operator", ""), f.get("operator", ""))
    vals = f.get("filter_values") or []
    if not vals and f.get("filter_value"):
        vals = [f["filter_value"]]
    quoted = " or ".join(f"'{v}'" for v in vals)
    return f"{f.get('column', '?')} {op} {quoted}"


def _format_created_at(iso_str: str | None) -> str:
    if not iso_str:
        return ""
    try:
        dt = datetime.fromisoformat(iso_str)
        return dt.strftime("%b %d, %Y %H:%M:%S")
    except (ValueError, TypeError):
        return iso_str


def _group_stat_card(stat: dict[str, Any]) -> str:
    col = _escape_html(stat.get("column", "?"))
    unique = _escape_html(stat.get("unique_count", 0))
    rows_html = ""
    for r in stat.get("rows", []):
        val = _escape_html(r.get("value", ""))
        ru = _escape_html(r.get("unique_count", 0))
        rows_html += f"<tr><td>{val}</td><td>{ru}</td></tr>"
    return (
        f"<details class='group-stats-card'>"
        f"<summary class='group-stats-summary'>"
        f"<span class='group-stats-column'>{col}</span>"
        f"<span class='group-stats-count'>Exception records: {unique}</span></summary>"
        f"<div class='group-stats-scroll'><table class='group-stats-table'>"
        f"<thead><tr><th>Value</th><th>Exception records</th></tr></thead>"
        f"<tbody>{rows_html}</tbody>"
        f"</table></div>"
        f"</details>"
    )


def _distribute_evenly(items: list[dict[str, Any]], max_per_row: int = 4) -> list[list[dict[str, Any]]]:
    """Mirror the result page's balanced aggregation-card row layout."""
    if not items:
        return []
    if len(items) <= max_per_row:
        return [items]
    row_count = (len(items) + max_per_row - 1) // max_per_row
    base_size, remainder = divmod(len(items), row_count)
    rows: list[list[dict[str, Any]]] = []
    offset = 0
    for index in range(row_count):
        size = base_size + (1 if index < remainder else 0)
        rows.append(items[offset : offset + size])
        offset += size
    return rows


def _render_group_section(title: str, stats: list[dict[str, Any]]) -> str:
    if not stats:
        return ""
    rows = []
    for row in _distribute_evenly(stats):
        cards = "".join(_group_stat_card(stat) for stat in row)
        rows.append(
            f"<div class='group-stats-row group-stats-row--{min(len(row), 4)}'>{cards}</div>"
        )
    return (
        f"<div class='group-stats-panel' aria-label='{_escape_html(title)}'>"
        f"{''.join(rows)}</div>"
    )


def export_html(result: dict[str, Any], report_name: str, created_at: str | None = None) -> str:
    comparison = result.get("comparison", {})
    validation = result.get("validation", {})
    key_columns = list(result.get("key_columns") or [])

    sections: list[str] = []

    sections.append("<!DOCTYPE html>")
    sections.append("<html><head>")
    sections.append(f"<title>{_escape_html(report_name)}</title>")
    sections.append("<style>")
    sections.append(":root { color-scheme: light; }")
    sections.append(
        "body { background:#f5f7fa; color:#1f2937; "
        "font-family:system-ui,sans-serif; margin:0; padding:24px; }"
    )
    sections.append("main { max-width:1200px; margin:0 auto; }")
    sections.append(
        ".report-header { display:flex; align-items:center; gap:12px; margin-bottom:12px; }"
    )
    sections.append(".report-header h1 { margin:0; font-size:1.35rem; }")
    sections.append(".run-time, .section-logic { color:#64748b; font-size:.85rem; }")
    sections.append(
        ".card { background:#fff; border:1px solid #dce2ea; "
        "border-radius:8px; padding:16px; margin-bottom:12px; }"
    )
    sections.append(
        "h2 { margin:0 0 12px; font-size:1.05rem; text-transform:uppercase; color:#64748b; }"
    )
    sections.append(
        ".summary-grid { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:8px; }"
    )
    sections.append(".metric { border:1px solid #e5eaf0; border-radius:6px; padding:12px; }")
    sections.append(".metric b { display:block; font-size:1.5rem; }")
    sections.append(".metric span { color:#64748b; font-size:.72rem; text-transform:uppercase; }")
    sections.append(".group-stats-panel { margin-top:8px; }")
    sections.append(
        ".group-stats-row { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); "
        "gap:8px; margin-bottom:8px; align-items:stretch; }"
    )
    sections.append(".group-stats-row--1 { grid-template-columns:minmax(0,1fr); }")
    sections.append(".group-stats-row--2 { grid-template-columns:repeat(2,minmax(0,1fr)); }")
    sections.append(".group-stats-row--3 { grid-template-columns:repeat(3,minmax(0,1fr)); }")
    sections.append(
        ".group-stats-card { display:flex; flex-direction:column; min-width:0; "
        "background:#fff; border:1px solid #dce2ea; border-radius:8px; padding:16px; }"
    )
    sections.append(".group-stats-summary { cursor:pointer; font-weight:600; }")
    sections.append(".group-stats-column { display:block; font-family:ui-monospace,monospace; }")
    sections.append(
        ".group-stats-count { display:block; margin-top:2px; color:#64748b; "
        "font-size:.85rem; font-weight:400; }"
    )
    sections.append(".group-stats-scroll { max-height:192px; overflow-y:auto; }")
    sections.append(".group-stats-table { margin-top:8px; }")
    sections.append(
        "table { border-collapse:collapse; width:100%; margin-top:12px; font-size:.85rem; }"
    )
    sections.append(
        "th, td { border:1px solid #dce2ea; padding:8px 10px; "
        "text-align:left; vertical-align:top; }"
    )
    sections.append(
        "th { background:#eef2f6; color:#64748b; font-size:.72rem; text-transform:uppercase; }"
    )
    sections.append("code { white-space:pre-wrap; }")
    sections.append(
        "@media (max-width:900px) { .group-stats-row { grid-template-columns:"
        "repeat(3,minmax(0,1fr)); } .group-stats-row--1 { grid-template-columns:1fr; } "
        ".group-stats-row--2 { grid-template-columns:repeat(2,minmax(0,1fr)); } }"
    )
    sections.append(
        "@media (max-width:680px) { .summary-grid { grid-template-columns:1fr 1fr; } "
        ".group-stats-row { grid-template-columns:repeat(2,minmax(0,1fr)); } "
        ".group-stats-row--1 { grid-template-columns:1fr; } }"
    )
    sections.append("@media (max-width:520px) { .group-stats-row { grid-template-columns:1fr; } }")
    sections.append("</style>")
    sections.append("</head><body><main>")

    sections.append("<div class='report-header'>")
    sections.append(f"<h1>{_escape_html(report_name)}</h1>")
    formatted_time = _format_created_at(created_at)
    if formatted_time:
        sections.append(f"<span class='run-time'>Ran on {_escape_html(formatted_time)}</span>")
    sections.append("</div>")

    sections.append("<section class='card' id='overall'>")
    sections.append("<h2>Overall result</h2>")
    rows_a = comparison.get("total_rows_a", 0)
    rows_b = comparison.get("total_rows_b", 0)
    changes = comparison.get("rows_with_changes", 0)
    attr_changes = comparison.get("total_attribute_changes", 0)
    violation_rows = validation.get(
        "distinct_violating_rows", validation.get("total_violations", 0)
    )
    violation_attrs = validation.get(
        "distinct_violating_attributes", validation.get("total_violations", 0)
    )
    targets = result.get("target_columns") or []
    filters = result.get("filters_applied") or []
    filter_text = (
        "; ".join(_format_filter_row(f) for f in filters) if filters else "No filtering applied"
    )
    sections.append(
        "<p class='section-logic'>"
        f"Comparison across {len(targets)} target columns."
        f"<br>Filtering: {_escape_html(filter_text)}"
        "</p>"
    )
    sections.append("<div class='summary-grid'>")
    sections.append(_metric("Records loaded", rows_a + rows_b))
    sections.append(_metric("Rows with rule exception", violation_rows))
    sections.append(_metric("Attributes with rule exception", violation_attrs))
    sections.append(_metric("Rows changed", changes))
    sections.append(_metric("Attributes changed", attr_changes))
    sections.append("</div>")

    grp = result.get("group_statistics") or {}
    overall_grp = grp.get("overall") or []
    sections.append(_render_group_section("Aggregation by grouping columns", overall_grp))
    sections.append("</section>")

    sections.append("<section class='card' id='changes'>")
    attr_changes_grp = grp.get("attribute_changes") or []
    sections.append(_render_group_section("Attribute change aggregation", attr_changes_grp))
    sections.append("<h2>Attribute changes</h2>")
    sections.append(
        "<p class='section-logic'><code>In Baseline ≠ In Comparison</code> "
        "on shared target columns.</p>"
    )
    row_details = comparison.get("row_details") or []
    if row_details:
        sections.append("<table>")
        sections.append(_detail_header(key_columns))
        for row in row_details:
            key_values = row.get("key_columns", {})
            for change in row.get("attribute_changes", []):
                sections.append("<tr>")
                sections.append(_identity_cells(key_columns, key_values, row.get("row_index", "")))
                sections.append(f"<td>{_escape_html(change.get('column', ''))}</td>")
                sections.append(f"<td>{_escape_html(change.get('file_a_value', ''))}</td>")
                sections.append(f"<td>{_escape_html(change.get('file_b_value', ''))}</td>")
                sections.append("<td>Values differ</td>")
                sections.append("</tr>")
        sections.append("</table>")
    else:
        sections.append("<p>No detail rows.</p>")
    sections.append("</section>")

    violations_by_rule = validation.get("violations_by_rule") or {}
    rule_summaries = validation.get("rule_summaries") or {}
    rule_ids = list(dict.fromkeys([*violations_by_rule, *rule_summaries]))
    for rule_id in rule_ids:
        violations = violations_by_rule.get(rule_id) or []
        summary = rule_summaries.get(rule_id) or {}
        sample = violations[0] if violations else {}
        rule_name = summary.get("name") or sample.get("rule_name") or rule_id
        logic = (
            summary.get("logic")
            or sample.get("rule_logic")
            or "Rule details unavailable for this older run"
        )
        row_count = validation.get("violating_rows_by_rule", {}).get(rule_id, len(violations))
        attribute_count = validation.get("violating_attributes_by_rule", {}).get(
            rule_id, len(violations)
        )
        sections.append(f"<section class='card' id='rule-{_escape_html(rule_id)}'>")
        sections.append(f"<h2>{_escape_html(rule_id)} — {_escape_html(rule_name)}</h2>")
        if summary.get("condition"):
            sections.append(
                "<p class='section-logic'>Condition: "
                f"<code>{_escape_html(summary['condition'])}</code></p>"
            )
        if summary.get("condition_grouping"):
            sections.append(
                "<p class='section-logic'>Grouping: "
                f"<code>{_escape_html(summary['condition_grouping'])}</code></p>"
            )
        sections.append(
            "<p class='section-logic'>Expectation: "
            f"<code>{_escape_html(_humanize_rule_logic(logic))}</code></p>"
        )
        sections.append("<div class='summary-grid'>")
        sections.append(_metric("Rows with exception", row_count))
        sections.append(_metric("Attributes with exception", attribute_count))
        sections.append("</div>")
        rule_grp = (grp.get("validation_rules") or {}).get(rule_id, [])
        sections.append(_render_group_section("Aggregation by rule grouping columns", rule_grp))
        if violations:
            sections.append("<table>")
            sections.append(_detail_header(key_columns))
            for violation in violations:
                sections.append("<tr>")
                sections.append(
                    _identity_cells(
                        key_columns,
                        violation.get("key_columns", {}),
                        violation.get("row_index", ""),
                    )
                )
                sections.append(
                    f"<td>{_escape_html(violation.get('violating_column', rule_id))}</td>"
                )
                sections.append(f"<td>{_escape_html(violation.get('comparison_value', ''))}</td>")
                sections.append(f"<td>{_escape_html(violation.get('violating_value', ''))}</td>")
                sections.append("<td>Rule requirement not met</td>")
                sections.append("</tr>")
            sections.append("</table>")
        else:
            sections.append("<p>Nil exception detected under current rule.</p>")
        sections.append("</section>")

    sections.append("</main></body></html>")
    return "\n".join(sections)


def _format_key(key_columns: dict[str, Any]) -> str:
    return ", ".join(f"{k}={v}" for k, v in key_columns.items())


def export_csv(result: dict[str, Any], report_name: str) -> str:
    output = io.StringIO()
    writer = csv.writer(output)

    comparison = result.get("comparison", {})
    validation = result.get("validation", {})

    writer.writerow(["Section", "Metric", "Value"])
    _write_summary_row(writer, "Total Rows A", comparison.get("total_rows_a", 0))
    _write_summary_row(writer, "Total Rows B", comparison.get("total_rows_b", 0))
    _write_summary_row(writer, "Rows with Changes", comparison.get("rows_with_changes", 0))
    attr_chg = comparison.get("total_attribute_changes", 0)
    _write_summary_row(writer, "Total Attribute Changes", attr_chg)
    _write_summary_row(writer, "Total Violations", validation.get("total_violations", 0))
    writer.writerow([])

    row_details = comparison.get("row_details", [])
    if row_details:
        writer.writerow(["Changes", "Row", "Key", "Column", "A", "B"])
        for row in row_details:
            key_str = _format_key(row.get("key_columns", {}))
            for change in row.get("attribute_changes", []):
                writer.writerow(
                    [
                        "Change",
                        _sanitize_csv_value(row.get("row_index", "")),
                        _sanitize_csv_value(key_str),
                        _sanitize_csv_value(change.get("column", "")),
                        _sanitize_csv_value(change.get("file_a_value", "")),
                        _sanitize_csv_value(change.get("file_b_value", "")),
                    ]
                )

    violations_by_rule = validation.get("violations_by_rule", {})
    if violations_by_rule:
        writer.writerow([])
        writer.writerow(["Violations", "Row", "Rule", "Key", "Details"])
        for rule_id, violations in violations_by_rule.items():
            for v in violations:
                key_str = _format_key(v.get("key_columns", {}))
                writer.writerow(
                    [
                        "Violation",
                        _sanitize_csv_value(v.get("row_index", "")),
                        _sanitize_csv_value(rule_id),
                        _sanitize_csv_value(key_str),
                        _sanitize_csv_value(v.get("details", "")),
                    ]
                )

    return output.getvalue()


def _write_summary_row(writer: Any, metric: str, value: Any) -> None:
    writer.writerow(["Summary", metric, _sanitize_csv_value(value)])
