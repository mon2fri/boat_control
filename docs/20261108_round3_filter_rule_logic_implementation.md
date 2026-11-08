# Round 3 implementation and fix record

Branch: `work/20261108-grouped-validation-integration`; baseline `a7a0bdc`.
Requirement: `requirements/20261108_req_filter_rule_logic_enhancement.md`, copied
from the current original main checkout after the user's pause/re-read.
Screenshots reviewed read-only: 23-08-28, 23-09-17, 23-12-24 on 2026-11-08.

## Scope and implementation

- **E1:** New Exceptions Only uses the Results title style and adjacent
  focusable SectionHint. React-rendered standalone HTML retains the help and
  serializes the checkbox's actual checked state, disabled as a snapshot rather
  than pretending to change a report's server scope. Direct backend HTML also
  has a styled scope heading with keyboard/hover help.
- **E2:** Captured run rule summaries now include numbered condition/expectation
  clause lists and explicit grouping hierarchy strings. This is presentation
  metadata; evaluation, authored payloads and canonical identities are unchanged.
  Excel per-rule metadata is name, Conditions, Condition Groupings, Expectations,
  Expectation Groupings, Rule Identifier. Each list/hierarchy is one multiline
  wrapped cell with a suitable row height. Table headers move to row 8, details
  to row 9. Existing scalar/formula/compound-value protections remain intact.
  Legacy saved summaries fall back to their stored descriptions, using a bounded
  parser for numbered AND/OR references and preserving raw text when not parsable;
  exports never look up mutable current catalog definitions for a historical run.
- **E3:** Result mapping, per-rule sections and navigation sort presentation by
  numeric rule index. Backend HTML sections, contents, summaries and XLSX rule
  sheets use the same numeric ordering. Authored/enabled rule order is not changed.
- **E4:** Add filter explicitly expands CollapsibleCard before inserting the row.
- **E5:** The four requested cards move explanatory text into their adjacent
  accessible title hints, including collapsed summaries and value-picker hints.
- **E6/E7:** Renamed Combining Filters with / Combining Conditions with, removed
  Combine filters, and gave grouping heading, builder legend, field labels and
  member subsection headings distinct visual levels. Member predicates retain
  normal sentence case rather than inherited uppercase label styling.
- **E8:** Condition group members include numbered badges AND actual column,
  operator and values, using the same renderer as filters/expectations.
- **E9:** Group headers and Existing groups picker entries share a green
  numbered badge. Picker accessible names retain operator/member count.
- **B1:** Multiple independently created groups remain editor-local draft roots.
  Only a single explicitly formed root is emitted as an executable tree. Multiple
  roots emit null, show an actionable error and cannot save/run. The user must
  select the existing groups and create an AND/OR parent. Loaded explicit trees,
  including R079's root OR, remain intact. Remove-all remount/reset tokens clear
  draft roots as well as the persisted tree; no implicit parent or AND fallback.

## Regression evidence and validation

Implementation regressions cover explicit joining/save blocking, loaded trees,
source/group badge labels, add-while-collapsed, scope checkbox/help and standalone
HTML state, numeric mapped/contents order, real workbook headers/line wrapping,
legacy saved-run header fallback and scalar/formula-safe exports. Exact final
checks and browser evidence are recorded in the round 3 review on completion.

User configuration/data edits remain outside implementation commits. Browser
verification must use isolated copies; backend restarts must avoid unintended
catalog synchronization. No worker dispatch, main merge or push is performed.

## Final validation and operational handoff

- Backend full suite, isolated `GROUPED_VALIDATION_HOME=/tmp/opencode/round3-checks`:
  795 passed (`tests/backend tests/contracts tests/integration`).
- Frontend full suite: 652 passed / 3 skipped (72 files passed / 3 skipped).
- Final badge/scope/editor focused regressions: 33 passed after the last visual fix.
- TypeScript/production build, changed-file Ruff, mypy (96 source files), Django
  check, no-migration check and `git diff --check` passed. Vite retains its
  existing >500 KB bundle advisory.
- Chrome used `/tmp/opencode/round3-ui` and port 45305, with isolated config,
  catalog, uploads, saved-run copies and tracking storage. It verified add-filter
  expansion, four card help icons by focus, separate G1/G2 drafts with no assumed
  G3, blocked save, explicit OR-parent creation and green badge RGB(23,99,61).
  A real R079 run then succeeded. HTML and Excel were downloaded via the UI.
- `/tmp/round3-ui-report.xlsx` was reopened: 4 expectation lines in B4, full
  grouping hierarchy in B5, unchanged R079 identifier in B6 and 34 detail rows.
- `/tmp/round3-ui-report.html` was opened standalone in Chrome: scope checkbox
  stays checked and disabled; its help appears on keyboard focus. No page errors.
- Screenshots: `/tmp/round3-unjoined-groups.png`, `/tmp/round3-results.png`,
  `/tmp/round3-offline-html.png`. Browser script/log: `/tmp/round3-browser.mjs`,
  `/tmp/round3-browser-export.log`.
- Stopped isolated server 45305 after verification. Restarted standard backend
  45303 directly (no migrations/catalog sync) to load the new run/report code;
  log `/tmp/round3-standard-server.log`, PID file `/tmp/round3-standard-server.pid`.
  Open http://127.0.0.1:45303/ and Ctrl+Shift+R for user acceptance.

User retest: recreate two independent expectation groups; verify there is no G3
until both groups are selected and explicitly joined. Inspect actual condition
predicates in grouping, source/group badge correspondence and help icons. Run a
nonempty population, inspect numeric rule/contents ordering, then download HTML
and Excel. Excel now uses metadata rows 1–6, table header row 8 and details row 9.

## Follow-up — removing a parent preserves its child groups (all editors)

- **Defect/cause:** `PerGroupingEditor.removeGroup` filtered out the entire
  selected subtree, deleting nested groups along with their parent relationship.
- **Fix:** the shared editor promotes the removed parent's immediate child
  groups to independent draft roots, preserving their own nested structures,
  predicates and operators. Direct leaf members return to the available clause
  picker. Other root groups are left intact. No rule ID is special-cased.
- **Scope:** shared by Row Filters, Rule Conditions and Rule Expectations for
  every rule. Remove all groups remains an intentional complete grouping reset.
- **Validation:** independent child groups require explicit rejoining; a lone
  promoted group with loose clauses is also incomplete and cannot save/run.
- **Regression:** both AND and OR parents with arbitrary condition IDs; removing
  another root leaves its sibling intact; filter parent with group + direct leaf;
  condition preservation/rejoining; actual R079 shape retaining all four
  expectations and round-tripping the rebuilt parent payload. 47 focused tests
  pass across the four editor test files. TypeScript/production build passes.
- **Chrome:** isolated port 45305 verified Remove Group 3 leaves Groups 1/2 and
  all four clauses, saving is blocked, and explicitly recreating the parent
  works without page errors. Screenshot `/tmp/r079-parent-removed.png`;
  log `/tmp/r079-parent-browser-final.log`. No user catalog/config was changed.

## Follow-up — enabled rules on the Run now page

User request: before execution, show the enabled rule count and every enabled
rule's local index/name. `EnabledRunRules` uses the exact ordered rule indices
in the pending run request, resolving names from the shared catalog cache. The
catalog's initial response includes all enabled rules (pinned outside its normal
page), so the list is not limited to the ten visible rule-editor rows. Unselected
rules are omitted; zero rules explains that comparison runs without validation.
Loading/name-fetch failures retain the indices and show honest name placeholders.
The summary does not alter rule selection or execution order.

Validation: 4 tests passed (component cases plus the upload/prepare/Run now
journey); TypeScript/production build and diff whitespace check passed. Chrome
used isolated storage and the 11-rule preset: count 11, all R079–R089 indices and
names visible, including the off-page rule, no page errors. Screenshot:
`/tmp/enabled-run-rules.png`; log `/tmp/enabled-run-rules-browser.log`.
No user catalog/config/data changes. Backend restart is unnecessary for this
frontend-only change; hard-refresh the running standard app at port 45303.
