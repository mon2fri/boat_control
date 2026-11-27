# Rule-evolution tracking contract for Worker C (published by Worker B)

Date: 12 November 2026. Status: implemented on `feat/rule-evolution-worker-b`,
pending Worker A's lineage prerequisite and the integrator's frozen interface.
This document is the early publication of sample JSON and acceptance
request/error semantics for C (via the integrator).

## 1. New status and list fields (backward compatible)

`GET /api/exception-tracking/?as_of_date=2026-10-30` rows gain optional fields
(every existing field keeps its shape; legacy rows return defaults):

```json
{
  "exception_id": "CBR1_BBBB..._xxxx",
  "status": "RecertificationRequired",
  "exception_commentary": "September review note",
  "recertification_required": true,
  "recertification_reason": "Recertification due to rule change",
  "carried_from_exception_id": "CBR1_AAAA..._xxxx",
  "carried_from_as_of_date": "2026-09-30",
  "carried_from_rule_identifier": "CBR1_AAAA...",
  "rule_evolution_event_id": "evt-2026-10-15-revision",
  "recertified_at": null,
  "revision_token": "evt-2026-10-15-revision"
}
```

- `status` gains exactly one value: `RecertificationRequired`. Existing
  `New` / `NotCommented` / `Commented` behavior is unchanged.
- Pending rows keep their inherited text verbatim in `exception_commentary`;
  the exact label **`Recertification due to rule change`** lives only in
  `recertification_reason`, never inside the text, so uploads cannot
  accidentally certify it.
- `revision_token` is `""` for rows that were never carried; otherwise it is
  the `rule_evolution_event_id` that created the target revision.
- `available_filters.status` includes `RecertificationRequired`; `filter_status`
  and status sorting accept it. Pending rows sort with `New` items.

## 2. New Exceptions Only

`RecertificationRequired` is reviewable under New Exceptions Only even when
commentary is nonblank: results, run detail, tracking counts, HTML/Excel
reports, and workbook exports all keep pending items in the review population.
Accepted rows return to `Commented` and are hidden as before.

## 3. Explicit acceptance (only path that clears pending)

`POST /api/exception-tracking/recertify/` with JSON:

```json
{
  "as_of_date": "2026-10-30",
  "exception_ids": ["CBR1_BBBB..._xxxx"],
  "revision_tokens": {"CBR1_BBBB..._xxxx": "evt-2026-10-15-revision"}
}
```

- `revision_tokens` echoes each row's `revision_token` (missing entries default
  to `""`). Acceptance of unchanged carried text is supported.
- Success (200): `{"as_of_date", "accepted": [...], "already_accepted": [...],
  "total", "exceptions": [...]}`. Repeating an accepted batch succeeds as a
  retry-safe no-op (`already_accepted`).
- Errors (nothing is written on any error — atomic reject):
  - `404 unknown_exception_ids` with `details.unknown_ids`;
  - `409 stale_revision_token` with `details.stale_ids` (reload the list and
    retry; a stale confirmation can never certify a newer rule revision);
  - `400 blank_commentary_not_certified` with `details.blank_ids` (enter text
    first; blank is never certified);
  - `400 invalid_recertification_request` (empty selection);
  - `400 invalid_as_of_date`.
- No other operation certifies: downloading, rerunning, exporting, importing
  (even unchanged text), or editing text via upload only edits text. Clearing
  pending text keeps the row pending and reviewable.

## 4. Workbook (XLSX) additions

The Exceptions sheet appends six informational columns after the standard
metadata and before user detail columns:

`Recertification Reason | Carried From Exception ID | Carried From As-of Date |
Carried From Rule Identifier | Rule Evolution Event ID | Recertified At`

- Template Version (B2) / As-of Date (B3) positions, import ID matching,
  extra-column order, and formula protection are unchanged. Old workbooks
  without the new columns keep importing.
- Import ignores the provenance columns entirely: editing or re-uploading
  carried text never certifies it; use Recertify selected.

## 5. Reports

The HTML exception table and the Excel `Exception Table` sheet append a
`Recertification` column showing the exact reason for pending rows (blank for
accepted/ordinary rows). Membership and counts are unchanged: pending rows are
part of New Exceptions Only, not an additional report population.

## 6. What Worker B consumes from Worker A (FROZEN 2026-11-12)

Worker B adapts to `backend/apps/rules/evolution.py` exactly — no SQL, no
name/Rxxx/substring guessing:

- `get_predecessor_chain(target_identifier, *, lineage_id=None, max_depth=64)`
  → newest-first `PredecessorLink` list (`event_id`, `lineage_id`,
  `revision_number: int`, `source_identifier`, `target_identifier`,
  `relationship="revision"`, `change_type`, `save_decision`, `created_at`),
  inheritable `modify_current` executable-revision edges only
  (`save_as_new` roots yield `[]`). Raises `LineageNotFound` (unknown → B
  keeps legacy same-identity carry), `LineageAmbiguous(lineage_ids)` and
  `LineageCycle` (B warns in `RecordingSummary.carry_warnings`, carries
  nothing, and never guesses).
- `resolve_revision_context(target_identifier, *, lineage_id=None,
  revision_number=None, event_id=None)` → `RevisionContext(status,
  lineage_id, revision_number, event_id, rule_id, candidates)`; B persists
  `lineage_id`/`revision_number`/`event_id` per rule in run snapshots
  (`result["lineage_context"][rule_id]`) and threads `lineage_id` into each
  capture occurrence for disambiguation.
- Inheritable change types: `executable_revision`, `legacy_backfill` with
  `commentary_policy == "carry_forward_recertification"`.
- Worker B's focused tests use an explicit stub mirroring these exact
  function/exception/field names. Prerequisite request (via integrator):
  cherry-pick `337a7e6` (evolution service; depends on `3bc6c09` models/
  migration from the same A branch) so Worker B can run the actual
  integration check against the real service.
