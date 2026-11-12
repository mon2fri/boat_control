# Round 3 verification record

Implemented directly on integration from `a7a0bdc`.
Coverage/design: `docs/20261108_round3_filter_rule_logic_implementation.md`.
The completed checks and browser evidence are recorded below.

User edits to active rule YAML, S35 and test configuration files are excluded
from this work. The main checkout's requirement/index and CSVs remain untouched.

## Final disposition

**READY FOR USER UI VALIDATION.** All nine enhancements and the explicit-parent
grouping bug are addressed. No evaluation/identity/schema migration changed.

- Full backend: 795 passed under isolated settings.
- Full frontend: 652 passed, 3 skipped. Final badge/editor/scope focused checks:
  33 passed. Production build and TypeScript passed.
- Changed-file Ruff, mypy (96 files), Django check, migration check and diff
  whitespace check passed. Existing Vite bundle-size advisory remains.
- Real Chrome evidence: independent group drafts remain unjoined until explicit
  AND/OR creation; save is blocked while incomplete. Loaded explicit R079 trees
  remain intact. Add filter expands, card help responds to focus, group badges
  are green. Browser made an actual isolated R079 run and downloaded HTML/XLSX.
- Reopened workbook: 4 expectation lines, separate group hierarchy and unchanged
  identifier, 34 detail rows. Standalone HTML retained checked/disabled scope and
  working hover/focus help. No page errors. Numeric rule ordering is covered by
  unsorted R2/R10/R100 fixtures for result mapping/contents and backend HTML/XLSX.

A final browser check corrected a missed green badge on the tree's collapse
button (picker badges were already correct). A dedicated assertion now covers
that header badge; focused tests and bundle build were rerun afterward.

Standard app is available at http://127.0.0.1:45303/ after a backend-only restart
without startup synchronization. Hard-refresh to load the rebuilt bundle.
Temporary browser server 45305 was stopped. Full manual user acceptance is pending.
No pushes, main merges, worker modifications or user config/data changes were made.

## Parent-removal follow-up

Fixed shared subtree deletion: removing a parent now preserves its child groups
as independent drafts in every rule's expectations/conditions and Row Filters.
No R079-specific branching. Generic AND/OR tests, sibling preservation, mixed
leaf/group filters, condition regrouping and R079 payload round-trip pass:
47 focused tests. Production build/TypeScript and diff whitespace check pass.
Chrome confirmed the actual parent-removal/rejoin flow with no page errors.
User configs/data were untouched; rebuilt assets are available after hard refresh.

## Pre-run enabled-rule summary follow-up

The Run now confirmation now displays count and the full selected rule
index/name list, matching the run request rather than the catalog's current
visible page. Empty/loading/error cases are covered. Component + journey checks:
4 passed; TypeScript/build and diff check passed. Chrome verified all 11 enabled
rules, including the off-page rule, using isolated storage with no page errors.

## Pre-run scope spacing correction

Reproduced the enabled-rule/scope overlap (-4px gap) in real Chrome. Scoped the
margin correction to the Run now card and rebuilt production assets. No rule
selection, execution, catalog or user data behavior changed. Browser verification
uses the isolated 11-rule preset; screenshot `/tmp/run-summary-spacing-fixed.png`.
Final Chrome geometry checks passed at 1600px, 900px and 600px, each with a
16px gap and no page errors. Production build/TypeScript and diff check passed.
Temporary isolated server 45305 was stopped; standard app 45303 is available.
