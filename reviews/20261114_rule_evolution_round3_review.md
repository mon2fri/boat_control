# Round-3 integration review (2026-11-14)

Branch: `feat/rule-evolution-integration` (base `c26593d` at handoff).
Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/rule-evolution/integration`.
Primary checkout (`feat/rule-evolution`) untouched. User files preserved
uncommitted and excluded from every change: `data/exception_tracking2.db`
(live tracking DB, still the user's own bytes — integrity `ok`, per-date row
counts identical to the session-start copy) and the untracked
`config/rules/new_1114.yaml`. No live database was written by implementation,
tests, or verification; all reproduction ran on `/tmp` copies
(`GROUPED_VALIDATION_HOME=/tmp/r3-liveclone`, isolated `tmp_path` stores).

Reported successor identifier verified against the configuration database
(read-only): R095 (row 7, `CBR1_1QECTTZ5EDRVM6W18H1Z`, archived,
`superseded_by` R096) → R096 (row 8, **`CBR1_09ZGBK98QSKPZHQE39AS`** —
matches the report, archived, `superseded_by` R097) → R097 (row 9,
`CBR1_05ZPX9ZE5RP8BTMX121Q`, current head), all sharing lineage
`686f2893…`. Round-3 item 3 is blank; nothing was invented.

## Bug 1 — revised-rule exceptions appear twice

### Reproduction (isolated clone of the live databases)

Two Nov-4 runs straddle the same-day modify-current revision: run
`7396ad30161a` (15:53, R095, 14 violations incl. `…_1_Alice` with "KZ") then
revision R095→R096 (15:54:34), then run `81ecab3e1746` (15:54:41, R096, 15
violations). `record_exceptions` upserts per ID and leaves omitted exceptions
untouched, so the Nov-4 date table accumulates 29 rows: 14 predecessor IDs
plus 15 successor IDs, with Alice/Uma/Cathy/Ella/Iris/Oliver/Eve present
under both identifiers.

### Root cause (traced capture → repository → API → frontend)

The duplicate originates in **capture/lifecycle**: same-date accumulation
across a revision. Repository queries (`list_exceptions`), API serialization
(`record_to_dict`), and the frontend (renders the list API verbatim) each
faithfully present what the store holds — no layer duplicates on its own.
Fixing any single presentation layer without lifecycle awareness would either
miss exports or corrupt saved-run refresh, so the fix is a
**supersession-aware current view** in the repository, applied exactly where
a "current" listing is meant:

- `ExceptionTrackingRepository.list_current_exceptions()` (new, additive;
  `list_exceptions` unchanged): hides a predecessor row only when the same
  date table holds a successor row for the **same book** (lossless key
  equality) whose **recorded modify-current chain** contains the predecessor
  identifier. Save-as-new roots yield no chain, copies start new lineages,
  unrelated identifiers never match, different books never share keys —
  all stay separate. Ambiguous/cyclic/failed lineage lookups refuse to guess
  and hide nothing. History is untouched: original IDs, commentary,
  provenance, older date tables, `list_exception_history`, and per-ID reads
  are unchanged; no historical exception ID is rewritten.
- Wired into the tracking list view and the date-scope commentary export
  (the reported surfaces). Run-scope export, commentary import validation,
  recertification, saved-run refresh/enrich (`tracking_context`), and
  per-ID history keep the full store: the old R095 run's report and template
  still resolve its 14 membership IDs, and stale templates with predecessor
  IDs still import under Round-2 semantics.
- Cross-revision carry itself already worked (Alice/Uma carry "KZ" as
  pending with `carried_from_*` + event provenance; non-carried books keep
  predecessor continuity via first-seen backfill). Non-violating books
  (Karen, Olivia, Sam, …) get no manufactured successor and stay visible as
  captured — history preserved under existing historical-view semantics.

### Same-ID precedence (found while verifying recurrence)

Clearing the successor and recapturing on a later date resurrected the
hidden predecessor's text: cross-revision candidates were consulted before
the head revision's own latest state. New-row capture now prefers the
same-ID immediate-previous state when it carries user meaning (nonempty
text, pending mark, or revision/acceptance history); pristine empty rows
still fall through to cross-revision carry so never-carried text is not lost
after a degraded capture. This also protects target edits from being
overwritten by older predecessor text on recurrence.

## Bug 2 — Updated + empty commentary incorrectly becomes New

### Root cause

`status_for` derives New from `first_seen == as_of_date`. Carried rows were
born with `first_seen = target date` ("new review items dated today"), so
clearing a pending carry (Updated + empty/whitespace-only) read New instead
of the specified Not Commented. The Round-2 tests even encoded the
spec-violating expectation; the Round-2 requirements text (§28–29, §33–37)
already demands Not Commented here.

### Fix (two halves)

1. **Capture**: a pending carry now inherits the predecessor continuity
   origin (its first-seen, falling back to its occurrence date) instead of
   the target date. Pending display still wins through the flag; genuinely
   first-time rows (no predecessor) still read New. This also repairs
   Keep Current + empty DB text per the Round-2 decision table.
2. **Upload repair for pre-fix rows**: `apply_commentary_upload` backfills
   the continuity origin from the recorded `carried_from_*` provenance when
   a deliberate clear (Updated/Keep Current + empty) would otherwise leave
   a target-date first-seen. IDs without provenance keep New (safe fallback).
   Provenance (`carried_from_*`, event token), `recertified_at` audit, and
   occurrence history are preserved.

Updated + empty (or whitespace-only) now: clears commentary, clears pending,
sets exactly Not Commented, stamps audit/provenance, and stays Not Commented
across reload, same-date recapture, date export, and later-date recurrence
(same-ID continuity + precedence). All Round-2 upload semantics retained:
Keep Current reads the latest DB value, Blank preserves pending + text,
ordinary Commented + empty preserves accepted text, invalid recertification
values reject the whole file atomically, commentary-only normalization.

## Verification

- New `tests/backend/test_rule_evolution_round3.py` (11 tests): Alice
  successor-only current view with carry/provenance, full-store history and
  older dates intact, non-violating Karen preserved with no manufactured
  successor, save-as-new/copy/unrelated/different-book isolation, multi-hop
  same-date (only head shows), idempotent recapture + target-edit
  preservation, list-view + date-export consistency, Updated + empty and
  whitespace-only → Not Commented, pre-fix first-seen repair, and
  reload/recapture/export/recurrence persistence.
- Stale Round-2 expectations updated to the written spec (Keep Current +
  empty and Updated + empty now expect Not Commented; carry first-seen
  expects the predecessor origin). No production-semantics test was
  weakened: every change moves an expectation from New to Not Commented
  exactly where the requirements already said Not Commented.
- Backend: isolated grouped settings **938 passed**; default settings 933
  passed + the 5 pre-existing `test_runs.py` base failures (byte-identical
  on the clean base). Frontend: `tsc -b` clean, **744 passed, 3 skipped**;
  ruff on touched files clean (2 pre-existing intentional SIM118
  `sqlite3.Row` notes remain); `git diff --check` clean.
- Live-data clone (`/tmp/r3-liveclone`, pristine copy; server
  `GROUPED_VALIDATION_HOME=/tmp/r3-liveclone … runserver 127.0.0.1:45308`):
  Nov-4 list 22 rows (was 29 with 7 hidden predecessors), Alice pending
  under the successor only, Karen-class books preserved, Nov-5 57 rows
  untouched, old R095 run report intact (14 violations), date template 22
  rows; Updated + whitespace-only upload on the pending Alice → cleared,
  pending cleared, **NotCommented**, first-seen backfilled to 2026-10-30.
  Real-browser (system Chrome via playwright-core) tracking-page check for
  Nov-4: successor visible, predecessor hidden, Karen visible, zero page
  errors; screenshot `/tmp/opencode/r3-tracking-nov4.png`.

## Limitations / follow-ups

- Rows cleared before this fix (pending already false, target-date
  first-seen) stay New until a later same-ID recurrence heals continuity;
  only the deliberate-clear upload path repairs provenance-backed rows.
- Uploading commentary to a superseded (view-hidden) predecessor ID is still
  accepted into the full store (Round-2 import semantics); it does not
  propagate to the successor.
- Running an archived/superseded rule after its successor captured the same
  date can trip strict capture verification (enrichment reads the current
  view); archived rules are not runnable from the UI, so this is out of
  scope.
- `PaginatedDetailSection` kind=`violation` still uses the legacy layout.
