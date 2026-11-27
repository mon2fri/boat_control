# Rule-evolution integration review (2026-11-12)

Branch: `feat/rule-evolution-integration`
Integration worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/rule-evolution/integration`
Base: `4b7c5bf` (planning package + requirement branch correction, on merged main `c3d190d`).
Status: integrated, verified, preview running. **UI acceptance: pending user execution.**

## Worker deliveries and cherry-pick ledger

All picks used explicit hashes with `git cherry-pick -x`; no merges; no conflicts.
Worker branches are untouched and kept for traceability.

### Worker A — `feat/rule-evolution-worker-a` @ `854cdda` (6 commits, clean)

| Worker commit | Integration commit | Subject |
| --- | --- | --- |
| `3bc6c09` | `aa044cf` | Rule lineage + evolution history tables with legacy backfill |
| `337a7e6` | `b62200f` | Rule-evolution service: extensive-edit detection + lineage queries |
| `fd8a8a0` | `6ae93bf` | Lineage events across catalog save flows |
| `99191ff` | `578df0c` | Save-decision contract, history endpoint, import lineage metadata |
| `8639e13` | `9c86790` | Rule-evolution tests (31 new + 2 adapted) |
| `854cdda` | `03ee728` | Worker A delivery note |

### Worker B — `feat/rule-evolution-worker-b` @ `130f836` (clean)

Prerequisite cherry-picks `51c03ac` (← A `3bc6c09`) and `665cd65`
(← A `337a7e6`) were done by B in its own worktree and are **excluded**
here (already present via A). Picked in order:

| Worker commit | Integration commit | Subject |
| --- | --- | --- |
| `8f90f9f` | `8049bb0` | Lineage interface + recertification storage |
| `89b5f81` | `b24a71e` | Lineage context through run capture/persistence |
| `c64453c` | `13d4748` | Recertification list/import/export APIs + workbook provenance |
| `5142a1d` | `cc84233` | Pending recertification in HTML/Excel reports |
| `0d950ce` | `86b5c60` | Recertification evidence + lineage walk fixes |
| `2472a82` | `8f051a0` | Adapt to frozen A service + persist revision context |
| `5dd6135` | `20c0884` | Degrade loudly on unexpected lineage lookup failure |
| `fd6b747` | `01b0ded` | Real-service carry test without edit-date run |
| `130f836` | `5097ea1` | Delivery addendum (real-service PASS) |

### Worker C — `feat/rule-evolution-worker-c` @ `8be4586` (clean)

| Worker commit | Integration commit | Subject |
| --- | --- | --- |
| `1378cc6` | `bea0a9c` | Frozen A/B contracts in wire/domain/mapping/endpoints |
| `3c0cdb3` | `60923c9` | Extensive-edit prompt, retry flow, rule history UI |
| `b3ead59` | `e531912` | Recertification selection/action, pending markers, carry warnings |
| `8be4586` | `5eba777` | Worker C delivery note |

### Integration-only commits (integrator-owned)

- `82ed8b7` — fix: `revision_tokens` sent as frozen keyed map
  `{exception_id: token}` (frontend sent a parallel array; B's
  `RecertifyRequestSerializer` declares a `DictField`, so the array would
  fail DRF validation). Updated the two asserting tests. Cross-reviewed
  and **approved by Worker C** (read-only follow-up).
- `82ed8b7` (same) — mechanical ruff fixes in new hand-written backend
  code (SIM102/SIM103, import block, two long lines).
- `c3c5033` — rebuilt `frontend/dist/` from the integrated tree.
- `42ce1d9` — `scripts/seed_rule_evolution_preview.py`.
- `5574afd`, `cc57209`, `bc0e8d5`, `a6e2c21`, `fde0b0b` — preparation
  record and contract decisions (A+B frozen, C acknowledged).

## Contract decisions

Frozen in `planning/rule-evolution/contract_decisions.md` (integrator-only):
A→B service (`get_predecessor_chain` / `resolve_revision_context`,
`PredecessorLink` fields, error semantics), A→C save contract (409 codes
`rule_save_decision_required` / `rule_save_stale` /
`rule_identity_reuse_conflict`, 400 invalid, 200 modify / 201 save-as-new,
history shape), B tracking/recertify contract (status
`RecertificationRequired`, exact reason label outside commentary text,
`revision_token` map concurrency guard, atomic error codes, 6-column XLSX
provenance, report column), import/startup policy (explicit `lineage_id`
hints, unannotated forks, atomic ambiguous failure), legacy backfill as
`carry_forward_recertification`. One approved ownership exception: A's
mechanical adaptation of `tests/integration/test_workflow.py` to the
mandated 409-first flow.

## Requirements coverage (spot-mapped to code/tests)

- Confirmed Sept→Oct carry with exact marker: B `record_exceptions` +
  `_carry_commentary`, proven by `test_rule_evolution_real_service.py`
  (real `get_predecessor_chain`, no Oct-15 run) and the live preview.
- Save-as-new vs modify-current + 409 confirmation: A repository/views,
  `test_rule_evolution.py` (ordinary/extensive/stale/reuse/rollback).
- History in configuration DB: migration `0003`, `RuleEvolutionHistory` /
  `RuleLineage`, history endpoint, `RuleHistoryPanel`.
- No cross-DB foreign keys; provenance via stable `event_id`; old rows/IDs
  preserved (`test_rule_evolution_recertification.py`: tombstones, clears,
  future dates, key mismatch, ambiguity, retries, target edits, chains,
  same-date snapshots, unrelated rules, legacy upgrade, workbook round
  trips, New-Exceptions-Only counts).
- Pending visible under New Exceptions Only; explicit recertify with
  unchanged text; upload never certifies; blank never certified.
- Frontend: save dialog (modify/save-as-new/back-to-editing, stale + reuse
  handling, native-dialog top layer), history dialog, recertify selection
  with frozen tokens, badges, offline-HTML marker retention.

## Migrations and upgrades

- Configuration DB: `0003_rule_evolution_history` (additive; backfills one
  lineage per `superseded_by` component; re-runnable no-op).
- Tracking DB: additive `ALTER TABLE ... ADD COLUMN` applied lazily on
  write and by `migrate_schema()`; legacy 10-column and intermediate tables
  load; missing flags read as not-pending (no mass recertification).
- Startup re-sync is idempotent: the seed asserts a second
  `migrate_rules_to_db` imports 0 rows and adds 0 history events.

## Checks run (integrated tree)

- Backend (default settings): **869 passed, 5 failed** — all 5 are
  `tests/backend/test_runs.py` (rule `R079` outcome column `sa_flag` in
  untouched `services.py`), verified byte-identical on clean base
  `4b7c5bf` (pre-existing, unrelated).
- Evolution suites: `test_rule_evolution.py` +
  `test_rule_evolution_recertification.py` +
  `test_rule_evolution_real_service.py` + `tests/integration`: **67
  passed**; same evolution suites under isolated grouped settings
  (`GROUPED_VALIDATION_HOME`, `--ds=boat_control.grouped_validation_settings`):
  **63 passed**.
- Targeted API/workbook/capture suites after lint fixes: **134 passed**.
- Frontend: `npx tsc -b` clean; `npx vitest run` **734 passed, 3 skipped,
  0 failed** (83 files); `npx eslint` on touched frontend files clean.
- `git diff --check` clean. Ruff on touched backend areas: 12 remaining =
  1 pre-existing base `0002` I001, 10 `0003`-migration E501s
  (makemigrations output style, left as generated), 1 intentional SIM118
  (`.keys()` is required: `in` on `sqlite3.Row` checks values, not keys).
- Builds: `npm run build` success, `frontend/dist/` committed (`c3c5033`);
  `uv build --out-dir release` produced wheel + sdist (artifacts ignored,
  not committed). A build is not a running preview; the preview is below.

## Unresolved risks / known limitations

1. The 5 pre-existing `test_runs.py` base failures (see above).
2. Ambiguity/cycle surfacing is log + `carry_warnings` banner only; no
   deeper review affordance (B/C/integrator agreement).
3. Worker's browser modal checks used intercepted fixtures; real-backend
   modal behavior awaits user UI testing.
4. Save-as-new duplicate-identity path follows existing dedup/hint
   behavior; cross-lineage target identity requires explicit conflict
   handling (by contract).

## Isolated preview (running)

- Preview home: `/tmp/boat-control-rule-evolution-preview-20261112-195416`
  (fresh; isolated `.config`, catalog `data/db.sqlite3`, rule/filter
  configs, tracking `data/exception_tracking.db`, `uploads/`, `results/`,
  tiny `sept_books_{a,b}.csv`). No live data copied or mutated. Seed
  script: `scripts/seed_rule_evolution_preview.py` (asserts every step).
- Seed contents: R001 v1 (`CBR1_08ZBHVJM3X7FY8524EG1`) Sept-30 run with
  book `xxxx` commented ("September review note"); recorded Oct-15
  modify-current revision → v2 (`CBR1_1K9RFWH02PFNE79D9S2H`, catalog
  `R001`→`R003`); Oct-30 run carries the text as pending with the exact
  reason + provenance (event `30081a62…`). R002 (`Retail books must be
  active`) is untouched for save-as-new testing. No Oct-15 run exists.
- Server (from the integration worktree, built frontend):
  `GROUPED_VALIDATION_HOME=<preview-home> .venv/bin/python
  backend/manage.py runserver 127.0.0.1:45304
  --settings=boat_control.grouped_validation_settings --noreload`
- URL: **http://127.0.0.1:45304/** — verified: `/api/health/` 200, page
  200 serving the new bundle, Sept row Commented, Oct row
  `RecertificationRequired` with reason + provenance, history
  creation→executable_revision, both saved runs listed, XLSX export with
  the 6 provenance columns. Server log:
  `/tmp/boat-control-rule-evolution-preview-server.log`.
- Stop: `pkill -f 'runserver 127.0.0.1:45304'` (or kill the background
  shell); restart with the command above. Do not delete the preview home
  before UI testing.

## User acceptance checklist — pending user execution

Per `planning/rule-evolution/ui_acceptance.md` (main scenario, editing +
history, edge cases + outputs): automated smoke checks above do NOT count
as acceptance. The user tests `feat/rule-evolution-integration` at the
preview URL. Suggested order: inspect Sept v1 + commentary → inspect
history (Oct-15 modify-current) → open Oct-30 run (changed exception ID,
carried text, exact marker + provenance) → confirm Sept unchanged and no
Oct-15 run → New Exceptions Only still shows Oct item → Recertify selected
without editing → reload/recapture/export round trip → editing/history
scenarios (metadata no-op, ordinary revision, extensive-edit 3-button
prompt, save-as-new lineage split, copy, history + grouping previews) →
edge cases (new book, clears, future dates, key changes, multi-hop,
existing-target preservation, run-scope vs date-wide export, HTML/Excel
offline, old-file compatibility). Record observations against the
integration commit; merge/push is a separate user decision.
