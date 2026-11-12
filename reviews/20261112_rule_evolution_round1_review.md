# Round 1 investigation and delivery note (2026-11-12)

Branch: `feat/rule-evolution-integration` (HEAD after this note).
Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/rule-evolution/integration`.
No workers spawned: narrow defect, fixed directly in the integration worktree.
Primary checkout (`feat/rule-evolution`) untouched; user staged files preserved.

## Reported bug

Same unchanged rule R007 ran for Oct 31 and Nov 1 in the preview home.
Commentary ("KZ updated") uploaded into Oct 31, but the same exceptions still
showed as new on Nov 1 (`reference/report_nov1.html`). Expected: eligible
Oct-31 commentary carries into Nov 1; both commented exceptions excluded when
New Exceptions Only is checked, accessible when unchecked and in the template.

## Evidence (originals read-only; copies under /tmp/opencode/round1-*)

- Tracking DB copy: Oct-31 rows Mia/Quinn carry "KZ updated" (rule
  `CBR1_10KNFYR39FHQJVZM43MX`, keys id/name); Nov-1 rows for the same IDs are
  empty, `first_seen 10-31` (continuity worked, commentary did not).
- Server-log chronology (UTC): Oct-31 runs 12:44:34/12:45:03, XLSX template
  export 12:45:17, **commentary import 12:46:04**, Nov-1 run 12:47:20,
  reference report ~12:53. The upload was BEFORE the Nov-1 capture, so this
  is a capture-time defect, not a reload question.
- Catalog copy: R007 is revision 5 of lineage `721ced68…` (seed R001 lineage
  continued through user edits); predecessor chain rev1..rev4 holds no
  Oct-31/Nov-1 commentary (all Oct-31 rows sit under the head identifier).
- Saved Nov-1 run persists capture-time `NotCommented` statuses (stale
  snapshot by design; live tracking is authoritative on reload).

## Root cause

`_cross_revision_attempt` returned `(None, True)` whenever revision edges
existed but no predecessor candidate carried commentary, unconditionally
blocking the legacy same-identity fallback. For an unchanged rule the
eligible commentary lives under the target's OWN identifier in an earlier
date table, so it was dropped (`commentary = ""`).

## Fix (integration commits `7346f51`, `20f4fde`, backend only)

1. **Unchanged-rule head rule**: when edges yield no candidate AND the target
   identifier never appears as a source in its own chain, return
   `(None, False)` so the same-ID fallback runs. A revert/round-trip shape
   (target revised away from before) keeps `(None, True)`.
2. **User directive — immediate-previous scope**: `_carry_commentary` and
   `_latest_predecessor_occurrence` now read ONLY the single latest date
   table strictly earlier than the target (never same-date, never older
   dates), for both the same-ID and cross-revision scenarios.
3. **Pending propagates** (user correction to the first fix, which copied
   text only): same-ID carry now copies text AND pending state — Commented
   rows land Commented with no recertification; still-pending rows land
   RecertificationRequired with reason, hop-by-hop provenance, and the
   originating event token; cleared-but-pending rows carry the mark without
   text; blank rows carry nothing.
4. B's `test_same_date_source_is_eligible` encoded the old `<=` rule; rewritten
   as `test_same_date_source_is_not_eligible` per the directive.

Reload semantics (documented intent, tested): capture-time INSERT is the
single carry point. Same-date recapture preserves stored commentary (empty is
indistinguishable from intentionally cleared), and reads/reloads never
synthesize commentary. Late uploads are visible on their own date only; a
later date picks them up only if captured afterwards.

## Verification

- New `tests/backend/test_rule_evolution_round1.py` (6 tests): reported
  chronology (upload before capture carries as Commented, no recertification),
  same-revision pending preservation with hop-by-hop provenance, revert shape
  still blocked, late-upload reload semantics incl. `refresh_result_dict`,
  target-edit/clear preservation (incl. cleared-pending mark without
  resurrection), scope filtering + unrelated books. All pass.
- Evidence-copy reproduction through the REAL service (`lineage_resolver=None`
  auto-probe): Nov-1 Mia/Quinn now carry "KZ updated" as Commented; Oct-31
  V2 seed row carries forward as RecertificationRequired with the originating
  event token; Harry/Iris correctly stay new; no warnings. (Original preview
  DB shows the pre-fix state and was never mutated.)
- Full backend + integration: **879 passed, 5 failed** (only the known
  pre-existing `test_runs.py` base failures). Frontend: **734 passed,
  0 failed**; `tsc`/`eslint`/`diff-check`/`ruff` clean for touched files
  (one intentional SIM118 `.keys()` for `sqlite3.Row` retained).
- `uv build --out-dir release` refreshed (ignored artifacts). No frontend
  change, so no `dist/` rebuild. `trigger.py` boot smoke-tested on `:45306`
  (health + page 200, migrations + rule sync OK, worktree clean).

## Previews

- Original (`:45304`, `/tmp/boat-control-rule-evolution-preview-20261112-195416`):
  left running with the user's data as-is (pre-fix Nov-1 rows). Restart:
  `GROUPED_VALIDATION_HOME=<home> .venv/bin/python backend/manage.py runserver
  127.0.0.1:45304 --settings=boat_control.grouped_validation_settings --noreload`.
- **Round-1 (`:45305`, `/tmp/boat-control-rule-evolution-preview-round1-20261112-211340`)**:
  fresh isolated home from `scripts/seed_rule_evolution_round1_preview.py`
  (R001 never revised; Oct-31 run → upload → Nov-1 run). Verified live:
  Mia/Quinn Nov-1 Commented with "KZ updated", Harry NotCommented.
  Same restart shape on port `45305`; server log
  `/tmp/boat-control-rule-evolution-round1-server.log`.

## Manual verification steps (Round-1)

On `:45305`: open Nov-1 tracking with New Exceptions Only checked — only
Harry shows; uncheck — Mia/Quinn appear with "KZ updated"; download the
commentary template — all three rows present; edit Harry's text, re-run
Nov-1 (same date) — edits preserved; clear Oct-31 Mia, re-run Nov-1 — no
resurrection (stays as stored).

## Limitations / follow-ups

- Same-date recapture cannot pull late uploads (preservation by design);
  no UI affordance exists to re-seed one date — noted, unchanged.
- Tombstone-via-edge early return now unreachable in single-table scope
  (kept as defensive documentation); gap-skipping (commented date, empty
  immediate previous, older text) intentionally does not carry per directive.
- The 5 pre-existing `test_runs.py` base failures remain.
