# Worker E delivery — rule-evolution Round-2 frontend

Date: 2026-11-12
Branch: `feat/rule-evolution-worker-e` (base `02afe4bb`, HEAD unchanged before work)
Worker: E — frontend end to end, `frontend/src/**` + frontend tests + this note only.
No backend, lockfile, or `frontend/dist/` changes.

## Contracts consumed

- Frozen A/B contracts from `planning/rule-evolution/contract_decisions.md`
  (single `RecertificationRequired` status + reason/provenance fields +
  `revision_token`; keyed-map `revision_tokens` recertify body already in
  base via `82ed7b7`).
- Worker C delivery (`reviews/20261112_rule_evolution_worker_c_delivery.md`):
  built directly on its wire/domain/mapping, save flow, history, tracking
  selection, and badge/export architecture. No C behavior removed.
- Worker D broadcast (received mid-assignment, applied before delivery):
  template headers `Exception ID | Exception Status | Commentary |
  Rule Index | Exception Rule Identifier | Key Columns |
  Exception Timestamp | Exception As-of Date |
  Exception First Seen As-of Date | Exception Last Seen As-of Date |
  Commentary Recertify` (+ ordered user detail columns; cols 5–10 hidden);
  six provenance columns removed from downloads (kept in DB + API);
  `Commentary Recertify` blank default with `Keep Current`/`Updated`
  dropdown; list/detail payloads unchanged; invalid selections → HTTP 400
  `invalid_recertification_selection` with `details.invalid_rows[] =
  {row, exception_id, value}`, whole file rejected atomically; pending
  Keep Current accepts stored text (DB nonempty → Commented, empty →
  Not Commented/New; clears pending); pending Updated+empty clears to
  Not Commented; pending Updated+nonempty stores (unchanged text counts
  as acceptance → Commented); pending Blank preserves; ordinary
  Commented nonempty accepts (even stale) / empty preserves; valid
  choices on nonpending rows ignored; counters unchanged; upload
  acceptance stamps `recertified_at`. I did not pull D's branch; the
  broadcast key points above are the acknowledged shapes.

## What was implemented (all under `frontend/src/`)

- R marker (`features/results/RecertificationBadge.tsx`, same component
  name/props): small purple `R` (`recertification-marker`, new CSS)
  beside exception IDs requiring recertification. Exact label
  `Recertification due to rule change` + carried-from provenance live in
  `title` and `aria-label` (`role="img"`), never as visible text.
- Single status presentation: tracking status cell keeps only
  `StatusBadge` (`RecertificationRequired`); the R moves next to the
  exception ID in the `exception_id` cell. The server-driven
  `recertification` column renders the same single R. Results
  (`DetailTable`, `ExceptionTable`) show the single R inline in the ID
  cell. No second visible badge anywhere (Karen duplicate-label case).
- Per-rule sequencing (`features/results/exceptionSequence.ts` new,
  `DetailTable` `sequenceSource` prop, `RuleResultSection` passes
  `result.details`): leading `#` column (sortable, restores violation-set
  order), Exception ID moved to the far right. Numbers are 1-based
  positions over the rule's ordered violation set joined on stable
  `rowKey` (never rewritten by identity resolution), so
  filter/sort/page/export agree; presentation only, never identity or
  import matching. Cross-rule `ExceptionTable` and unsequenced
  `DetailTable` (e.g. server-paginated sections) keep their layouts.
- Upload UI (`pages/ExceptionTrackingPage.tsx`): guidance copy matches
  D exactly (provenance columns removed; pending via Exception Status;
  `Commentary Recertify` last metadata column, blank default;
  Keep Current/Updated/blank semantics per D; ordinary Commented rules;
  invalid value rejects the whole file with per-row details). The 400
  `invalid_recertification_selection` handler lists each affected row
  (`row N <id> value "<v>"`, capped at five plus remainder count);
  ID-mismatch whole-file behavior and success counters unchanged.
- Offline HTML: clones rendered DOM, so the R marker and new column
  order travel automatically (covered by test); no template duplicated.

## Evidence (all in-worktree, `frontend/`)

- `npx tsc -b` — clean.
- `npx vitest run` — 84 files passed, 3 skipped; 744 passed, 3 skipped,
  0 failed. New suites: `features/results/exceptionSequence.test.ts`
  (index 1..n, rowKey-vs-identity keys, missing→null,
  filter/sort/export consistency, index-missing sorts last, rendered
  filter+sort stability incl. sort-by-`#` restoring order); extended
  `ruleEvolutionResults.test.tsx` (R rendering + accessible name, single
  marker in tracking-style and results cells, Exception-ID-last order,
  offline-HTML marker + order retention); extended
  `ExceptionTrackingPage.recertification.test.tsx` (single status, R
  beside ID with provenance, `Commentary Recertify` copy);
  `ExceptionTrackingPage.test.tsx` (new 400 row-specific error test;
  success-message regex narrowed to `/Updated \d+ exceptions/` to match
  the new guidance copy). Chunk A verified independently green in a
  scratch worktree (6 files, 58 tests). `results.test.tsx` header
  assertion updated to the new per-rule order; no other existing
  assertions needed changes.
- `npm run build -- --outDir /tmp/boat-rule-evolution-worker-e-dist` —
  success; `frontend/dist/` untouched (verified via `git status`).
- `npx eslint` on touched files — 0 errors; the only 2 warnings
  (`react-refresh/only-export-components` in `DetailTable.tsx`) verified
  pre-existing at base via stash-compare (new helper exports live in
  `exceptionSequence.ts` to avoid adding findings).
- Real browser (system Chrome via playwright-core, vite dev + intercepted
  frozen payloads; scratch script in `/tmp`, not committed): 11/11 —
  tracking single status, no verbose text, purple R
  (`rgb(124, 58, 237)`) beside ID, title provenance, results header
  order `# | … | Exception ID`, sequence `1,2,3`, single section R,
  zero page errors. Run at `713d5fe`; the later D commit (`da69118`)
  touches only guidance text + the import-error handler, so covered
  visuals are unchanged and jsdom suites re-pass at final HEAD.

## Assumptions / blocked integration

- Integrator owns final UI acceptance; no push/merge performed.
- D's `recertified_at` audit stamp needs no new UI (already mapped on
  the domain type); nothing else in list/detail payloads changed, so no
  mapping work was needed.
- `PaginatedDetailSection` kind=`violation` (server-paginated) is not
  used anywhere in the app today; it keeps the legacy ID-first layout
  with no sequence column. If the integrator routes per-rule violation
  sections through it, sequencing there needs the full ordered set from
  the server (client only ever holds loaded pages).

## Commits (on `feat/rule-evolution-worker-e`, no push)

- `9391c5d` Worker E: per-rule exception sequence with Exception ID last
- `713d5fe` Worker E: purple R marker, single pending status, Round-2 upload copy
- `da69118` Worker E: align with frozen Worker D template/upload contract
- Delivery note: `reviews/20261112_rule_evolution_round2_worker_e_delivery.md` (this file)
