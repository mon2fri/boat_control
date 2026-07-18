from __future__ import annotations

import csv
import html
import io
from typing import Any


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


def _summary_line(label: str, value: Any) -> str:
    return f"<p>{label}: {_escape_html(value)}</p>"


def export_html(result: dict[str, Any], report_name: str) -> str:
    comparison = result.get("comparison", {})
    validation = result.get("validation", {})

    sections: list[str] = []

    sections.append("<!DOCTYPE html>")
    sections.append("<html><head>")
    sections.append(f"<title>{_escape_html(report_name)}</title>")
    sections.append("<style>")
    sections.append("body { font-family: sans-serif; margin: 20px; }")
    sections.append("table { border-collapse: collapse; width: 100%; margin: 10px 0; }")
    sections.append("th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }")
    sections.append("th { background-color: #f2f2f2; }")
    sections.append(".summary { background: #f9f9f9; padding: 15px; border-radius: 5px; }")
    sections.append("h1, h2, h3 { color: #333; }")
    sections.append("</style>")
    sections.append("</head><body>")

    sections.append(f"<h1>{_escape_html(report_name)}</h1>")

    sections.append("<div class='summary'>")
    sections.append("<h2>Overall Results</h2>")
    rows_a = comparison.get("total_rows_a", 0)
    rows_b = comparison.get("total_rows_b", 0)
    changes = comparison.get("rows_with_changes", 0)
    attr_changes = comparison.get("total_attribute_changes", 0)
    violations = validation.get("total_violations", 0)
    sections.append(_summary_line("Records loaded (File A)", rows_a))
    sections.append(_summary_line("Records loaded (File B)", rows_b))
    sections.append(_summary_line("Rows with attribute changes", changes))
    sections.append(_summary_line("Total attribute changes", attr_changes))
    sections.append(_summary_line("Total validation violations", violations))
    sections.append("</div>")

    if comparison.get("row_details"):
        sections.append("<h2>Attribute Changes</h2>")
        sections.append("<table>")
        header = "<tr><th>Row</th><th>Key</th><th>Column</th><th>A</th><th>B</th></tr>"
        sections.append(header)
        for row in comparison["row_details"][:1000]:
            key_str = _format_key(row.get("key_columns", {}))
            for change in row.get("attribute_changes", []):
                sections.append("<tr>")
                sections.append(f"<td>{_escape_html(row.get('row_index', ''))}</td>")
                sections.append(f"<td>{_escape_html(key_str)}</td>")
                sections.append(f"<td>{_escape_html(change.get('column', ''))}</td>")
                sections.append(f"<td>{_escape_html(change.get('file_a_value', ''))}</td>")
                sections.append(f"<td>{_escape_html(change.get('file_b_value', ''))}</td>")
                sections.append("</tr>")
        sections.append("</table>")

    violations_by_rule = validation.get("violations_by_rule", {})
    if violations_by_rule:
        sections.append("<h2>Validation Violations</h2>")
        for rule_id, violations in violations_by_rule.items():
            if violations:
                sections.append(f"<h3>Rule {_escape_html(rule_id)}</h3>")
                sections.append("<table>")
                sections.append("<tr><th>Row</th><th>Key</th><th>Details</th></tr>")
                for v in violations[:500]:
                    key_str = _format_key(v.get("key_columns", {}))
                    sections.append("<tr>")
                    sections.append(f"<td>{_escape_html(v.get('row_index', ''))}</td>")
                    sections.append(f"<td>{_escape_html(key_str)}</td>")
                    sections.append(f"<td>{_escape_html(v.get('details', ''))}</td>")
                    sections.append("</tr>")
                sections.append("</table>")

    sections.append("</body></html>")
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
        for row in row_details[:5000]:
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
            for v in violations[:5000]:
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
