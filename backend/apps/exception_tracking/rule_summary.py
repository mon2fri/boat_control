"""Enabled-rule snapshots for the commentary template's first-tab rule table.

Worker B owns this helper and its rendering in
``apps.exception_tracking.workbook``. Worker A owns selecting and passing the
persisted scope-specific snapshots through the keyword-only ``rule_summaries``
workbook input; this module only normalizes what it is given.

Contract for ``rule_summaries`` (keyword-only, optional, default ``None``):

* A mapping of run-local rule index (``"R001"``) to that run's persisted
  validation summary mapping, exactly as stored under
  ``result["validation"]["rule_summaries"]`` by ``apps.runs.persistence``.
* Each summary carries the persisted snapshot keys
  ``condition_clauses`` (``list[str]``), ``expectation_clauses``
  (``list[str]``), ``condition_groupings`` (``str``),
  ``expectation_groupings`` (``str``), ``name`` (``str``), ``description``,
  ``logic``, ``condition``, ``condition_grouping``, ``hide_comparison`` and
  the canonical ``rule_identifier`` when the run knew it. Older runs may omit
  any of these keys; rendering falls back exactly like the exported Excel
  report (missing identifier renders ``"Unavailable"``).
* Summaries describe that run's enabled rule snapshots, never today's live
  catalog. Neither this helper nor the workbook consults the mutable current
  catalog for historical logic.
* An explicit ``enabled is False`` (or ``disabled is True``) marker excludes
  that entry; entries without a marker are treated as enabled because every
  persisted snapshot was captured from an enabled rule at its run time.
* An empty mapping value (``{}``) means the snapshot is missing for a known
  rule and renders every logic cell plus the identifier as ``"Unavailable"``.

Date-wide union policy (proposal for Worker A / integrator):

* Worker A passes one merged mapping covering every persisted snapshot
  available for the requested as-of date. ``merge_rule_snapshots`` implements
  the deterministic policy: iterate that date's runs in ascending ``run_id``
  order, keep the first snapshot seen per rule index, union every distinct
  rule index, and return human-readable notes for rule indexes whose
  snapshots differ across runs (quoting both run labels and both canonical
  identifiers). Differing snapshots of the same rule are therefore documented
  rather than silently collapsed, and no unavailable historic logic is
  invented: rule indexes known only from exceptions (no snapshot anywhere)
  may be listed via ``known_rule_ids`` and render as ``"Unavailable"`` rows.
* No new historical storage is introduced; unavailable metadata stays
  explicit and the export remains usable.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from typing import Any

from apps.reports.rule_headers import excel_rule_headers, rule_sort_key

RULE_TABLE_HEADERS: tuple[str, ...] = (
    "Rule Index/Name",
    "Conditions",
    "Condition Groupings",
    "Expectations",
    "Expectation Groupings",
    "Rule Identifier",
    "Description",
)

MISSING_METADATA = "Unavailable"

NO_SNAPSHOTS_MESSAGE = "No enabled rule snapshots available for this run."

_COMPARED_SNAPSHOT_KEYS: tuple[str, ...] = (
    "name",
    "description",
    "rule_identifier",
    "condition_clauses",
    "expectation_clauses",
    "condition_groupings",
    "expectation_groupings",
    "logic",
    "condition",
    "condition_grouping",
)


def normalize_rule_summaries(
    summaries: Mapping[str, Any] | None,
) -> dict[str, dict[str, Any]]:
    """Coerce persisted run validation summaries into plain per-rule dicts.

    ``None`` becomes ``{}``. Non-mapping values become ``{}`` so the renderer
    represents them as explicit ``"Unavailable"`` rows instead of crashing.
    """
    if not summaries:
        return {}
    normalized: dict[str, dict[str, Any]] = {}
    for rule_id, summary in summaries.items():
        key = str(rule_id)
        if isinstance(summary, Mapping):
            normalized[key] = dict(summary)
        else:
            normalized[key] = {}
    return normalized


def is_enabled_summary(summary: Mapping[str, Any]) -> bool:
    """An entry is enabled unless it is explicitly marked otherwise."""
    if summary.get("enabled") is False:
        return False
    return summary.get("disabled") is not True


def enabled_rule_summaries(
    summaries: Mapping[str, Any] | None,
) -> dict[str, dict[str, Any]]:
    """Normalize snapshots and drop entries explicitly marked disabled."""
    return {
        rule_id: summary
        for rule_id, summary in normalize_rule_summaries(summaries).items()
        if is_enabled_summary(summary)
    }


def rule_display_name(rule_id: str, summary: Mapping[str, Any]) -> str:
    """``R001 - Name`` for the table's first column, falling back to the index."""
    name = str(summary.get("name") or "").strip()
    if name and name != rule_id:
        return f"{rule_id} - {name}"
    return rule_id


def rule_identifier_text(summary: Mapping[str, Any]) -> str:
    """Canonical identifier, explicit when the snapshot does not know it."""
    return str(summary.get("rule_identifier") or MISSING_METADATA)


def _snapshot_signature(summary: Mapping[str, Any]) -> tuple[str, ...]:
    return tuple(repr(summary.get(key)) for key in _COMPARED_SNAPSHOT_KEYS)


def merge_rule_snapshots(
    labeled_snapshots: Sequence[tuple[str, Mapping[str, Any]]],
    *,
    known_rule_ids: Iterable[str] = (),
) -> tuple[dict[str, dict[str, Any]], list[str]]:
    """Deterministic union of one date's persisted rule snapshots.

    ``labeled_snapshots`` is ``[(run_label, rule_summaries), ...]`` in the
    caller's deterministic order (Worker A sorts runs by ascending
    ``run_id``). The first snapshot seen per rule index wins; every distinct
    rule index is kept. A note is returned for each rule index whose later
    snapshots differ, quoting both run labels and both canonical identifiers.
    ``known_rule_ids`` (for example rule indexes seen on that date's
    exceptions) with no snapshot anywhere become ``{}`` entries so the table
    renders them as explicit ``"Unavailable"`` rows.
    """
    merged: dict[str, dict[str, Any]] = {}
    first_label: dict[str, str] = {}
    first_signature: dict[str, tuple[str, ...]] = {}
    notes: list[str] = []
    for label, summaries in labeled_snapshots:
        for rule_id, summary in normalize_rule_summaries(summaries).items():
            if rule_id not in merged:
                merged[rule_id] = summary
                first_label[rule_id] = label
                first_signature[rule_id] = _snapshot_signature(summary)
                continue
            if _snapshot_signature(summary) == first_signature[rule_id]:
                continue
            notes.append(
                f"{rule_id}: snapshots differ across runs "
                f"({first_label[rule_id]} vs {label}); showing "
                f"{first_label[rule_id]} "
                f"(identifiers {merged[rule_id].get('rule_identifier')!r} vs "
                f"{summary.get('rule_identifier')!r})."
            )
    for rule_id in known_rule_ids:
        key = str(rule_id)
        if key not in merged:
            merged[key] = {}
    return merged, notes


def build_rule_table_rows(
    summaries: Mapping[str, Any] | None,
) -> list[tuple[str, ...]]:
    """One row per enabled rule, sorted numerically (R2 before R10).

    Cell text matches ``apps.reports.rule_headers.excel_rule_headers``
    semantics verbatim (conditions, condition groupings, expectations,
    expectation groupings), so the template table agrees with the exported
    Excel report for the same persisted snapshot. Empty grouping strings are
    preserved (a single ungrouped clause has no groupings); wholly missing
    snapshots render as ``"Unavailable"``.
    """
    rows: list[tuple[str, ...]] = []
    enabled = enabled_rule_summaries(summaries)
    for rule_id in sorted(enabled, key=rule_sort_key):
        summary = enabled[rule_id]
        if not summary:
            rows.append((rule_id, *(MISSING_METADATA,) * (len(RULE_TABLE_HEADERS) - 1)))
            continue
        conditions, condition_groups, expectations, expectation_groups = excel_rule_headers(summary)
        rows.append(
            (
                rule_display_name(rule_id, summary),
                conditions,
                condition_groups,
                expectations,
                expectation_groups,
                rule_identifier_text(summary),
                str(summary.get("description") or MISSING_METADATA),
            )
        )
    return rows
