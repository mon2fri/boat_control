# Round-2 integration review (2026-11-12)

Branch: `feat/rule-evolution-integration` (HEAD `1d13bb1` at handoff).
Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/rule-evolution/integration`.
Round-1 fixes preserved; no restart of the original implementation.
Primary checkout (`feat/rule-evolution`) untouched; user staged files preserved.
User config edits in this worktree (`config/rows_and_columns/s35.yaml`,
`config/rules/all_rules.yaml`, `config/rules/new_1112.yaml`) preserved
uncommitted and excluded from all worker bases/deliveries.

## Worker ledger (explicit hashes, cherry-picked with -x, no merges)

Worker D (backend, `feat/rule-evolution-worker-d` @ `417768d`, clean):
`46ce119` template → `cfbb7db` upload logic → `c73c684` test updates →
`1058f00` evidence → `417768d` delivery note. Integrated as `38fde28`,
`5c753cb`, `1dd9446`, `8f81071`, `d28b94f` (zero conflicts).

Worker E (frontend, `feat/rule-evolution-worker-e` @ `b4bbbde`, clean):
`9391c5d` sequencing → `713d5fe` R marker + copy → `da69118` D-contract
alignment → `b4bbbde` delivery note. Integrated as `03dde97`,
`f120767`, `6bc19f0`, `10ac640` (zero conflicts).

Integrator-only: Wendy first-seen backfill (`02afe4b`, precedes both
workers), same-ID pending propagation (`20f4fde`), contract amendments,
`round2_preparation.md` (`1ad205c`), rebuilt `frontend/dist/` (`7d18540`),
both preview seeds, this note.

## Root causes

1. Template presentation: six provenance columns were appended to downloads;
   removed from both scopes/entry points (single export path). Pending shows
   via Exception Status; "Commentary Recertify" (blank default, Keep
   Current/Updated dropdown) added. DB/API provenance untouched.
2. Upload rules: no authoritative per-state decision table existed. Added
   trim semantics + current-DB-state decisions (pending Keep Current /
   Updated±text / Blank; ordinary Commented accept/preserve incl. stale
   templates; nonpending unchanged), backend dropdown validation
   (`invalid_recertification_selection`, row-specific, atomic), clear vs
   preserve disambiguation.
3. Results/HTML: verbose badge rendered reason text as a second tag.
   Replaced with a small purple `R` (label + provenance in title/aria-label
   only); Exception ID moved far right; leading 1..n per-rule sequence over
   the ordered violation set (presentation only, stable across
   pagination/filter/sort/export); grouping-eye previews retained.
4. Wendy recurrence: no-candidate cross-revision left first_seen at the
   target date (New). Now backfills first_seen from the recorded predecessor
   occurrence (Not Commented), still copying no text and requiring no
   recertification. Genuinely first-time IDs stay New.
5. Karen duplicate labels: status cell + results tables rendered both the
   status badge and the reason badge. Single presentation now (StatusBadge /
   inline R); reason stays internal.

## Verification (integrated tree)

- Backend: default settings 926 passed + 5 pre-existing `test_runs.py`
  failures (environmental: checkout settings load repo rules referencing
  `sa_flag`; absent under isolated grouped settings); isolated grouped
  settings **931 passed, 0 failed**. New: 38 upload-matrix tests +
  Round-1/2 carry tests (incl. Wendy, pending propagation, revert guard,
  late-upload reload semantics, same-date exclusion, tombstone update).
- Frontend: `tsc -b` clean; **744 passed, 3 skipped** (84 files);
  `eslint` on touched files: 0 errors (2 pre-existing warnings + 3 errors
  in untouched files, confirmed identical at base); `git diff --check`
  clean. One real-browser run 11/11 (E) + jsdom re-green at HEAD.
- Ruff on touched backend files: only the intentional SIM118
  (`.keys()` required for `sqlite3.Row`); D's 5 remaining findings are
  pre-existing base lines.
- Live end-to-end on the Round-2 preview: template download shows the new
  11-column layout with working dropdown; Mia Updated+unchanged-text upload
  accepted (Commented, pending cleared, `recertified_at` stamped,
  provenance retained); Blank rows preserved; Quinn/Harry Not Commented
  with Oct-31 first-seen continuity.
- `uv build --out-dir release` refreshed (ignored). `frontend/dist/`
  rebuilt from the integrated tree and committed. `trigger.py` boot
  smoke-tested on `:45306` (health + page 200, migrations + rule sync OK,
  worktree clean apart from user configs).

## Fresh isolated preview (running, one instance)

- Home: `/tmp/boat-control-rule-evolution-preview-round2-20261112-232026`
  (seed script asserts every step; no live data touched).
- Contents: R001 v1 Oct-31 run (Mia/Harry/Quinn violate) → Mia "KZ updated"
  upload → modify-current revision (no edit-date run) → Nov-1 run (Mia
  pending with reason + provenance; Harry/Quinn Not Commented) → Nov-2 run
  (Mia pending propagated; others uncommented). Mia Nov-2 left PENDING for
  UI testing.
- Server (from the integration worktree, built frontend):
  `GROUPED_VALIDATION_HOME=<preview-home> .venv/bin/python
  backend/manage.py runserver 127.0.0.1:45307
  --settings=boat_control.grouped_validation_settings --noreload`
- URL: **http://127.0.0.1:45307/**. Server log:
  `/tmp/boat-control-rule-evolution-round2-server.log`.
- Stop: kill the 45307 runserver. Restart with the command above.
- `trigger.py` alternative (user preference): run from the integration
  worktree; serves `:45303` with the worktree-local catalog (user's Nov-1
  Wendy + Nov-2 Karen/Wendy rows live there with real history).

## Manual testing checklist (pending user execution)

Template: download from result + tracking pages (both scopes) — 11 columns,
no provenance, Recertify dropdown works, legacy template still imports.
Upload: pending Keep Current (DB text kept → Commented; empty DB → Not
Commented), Updated+empty (deliberate clear), Updated+nonempty incl.
unchanged text (accepted), Blank (preserve all); ordinary Commented
nonempty incl. stale template (accept) / empty (preserve); invalid dropdown
value (whole file rejected with row details, nothing written); retry;
unrelated rows untouched. Results/HTML: purple R with accessible name,
single status, ID far right, 1..n per rule stable across
pagination/filter/sort/export, offline HTML retains marker + order.
Wendy: Nov-2 row Not Commented (not New), no recertification. Karen:
single Recertification Required + R. Scope on/off counts; saved-run reload;
workbook round trip.

## Limitations

- Same-date recapture preserves stored state (empty indistinguishable from
  cleared); late uploads flow only to later-captured dates.
- Revert/round-trip shapes still block silent same-ID copies (first-seen
  backfill still applies).
- `PaginatedDetailSection` kind=`violation` (currently unused) keeps legacy
  layout; sequencing there needs server-supplied full ordering.
- 5 pre-existing `test_runs.py` base failures under default settings only.
