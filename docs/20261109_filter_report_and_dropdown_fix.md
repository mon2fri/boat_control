# Filter report presentation and dropdown stacking

Branch: `work/20261108-grouped-validation-integration`.
Baseline: `d29022b`. Requests: show a full numbered filter expression in Results
and standalone HTML; separate multiline Filters / Filter Groupings in Excel;
keep searchable dropdowns above cards and dismiss on outside click/focus loss.

## Implementation

- Applied-filter summaries now include a fully parenthesized expression using
  persisted run fields, with each Filter n followed by its actual predicate.
  Invalid/missing references produce no invented expression. Existing hierarchy
  and clause details remain available. The rendered HTML export clones the same
  expression; direct backend HTML uses the corresponding numbered expression.
- Overall XLSX Filtering information now has Filters and Filter Groupings rows.
  Each value is one multiline wrapped cell, with explicit Overall/Group n lines
  and appropriate row height. Saved flat/legacy AND and single/no-filter runs
  remain supported; invalid saved references are surfaced rather than flattened.
  Negative multi-value operators use AND between excluded values consistently.
- Shared FloatingListbox uses a native manual popover (browser top layer), keeping
  the DOM/ARIA relationship while escaping scroll/card clipping. Fixed anchoring
  follows viewport/container scroll, resize and popup size changes, placing the
  menu above the input when there is insufficient space below. Existing option,
  keyboard and free-text behavior is retained. Outside pointer clicks (including
  non-focusable content), focus leaving and Escape dismiss it; popover dismissal
  is synchronized with React state. Manual popovers avoid a browser light-dismiss
  race on the opening input click; explicit document listeners handle dismissal. Covers searchable single and multi selects
  throughout the app, including row-filter column/value menus.

## Validation

Final checks, browser evidence and operational handoff are recorded in the paired
review. All tests/browser runs use isolated storage; user config/data are untouched.

## Final evidence and user retest

- Full backend under isolated settings: 797 passed. Full frontend gate: 661
  passed / 3 skipped; final release recheck is recorded in the review.
- Final focused dropdown/filter presentation checks: 26 passed. Production
  build/TypeScript, mypy (96 source files), changed-file Ruff and diff check pass.
- Chrome verified Column and Value menus are in `:popover-open` and that
  `document.elementFromPoint` at the menu edge hits menu content, not the card
  beneath it. Outside heading clicks, Tab and Escape dismissed the menus.
- A native auto-popover initially dismissed on the same click that opened the
  input. Switched to manual top-layer popovers with explicit outside/focus/Escape
  listeners; browser and focused regressions passed after that correction.
- Browser completed a real isolated run using
  `system contains oomber AND (status equals active OR status equals inactive)`.
  The result and downloaded standalone HTML have the full numbered expression.
- Downloaded XLSX reopened: Filters is one wrapped cell with three numbered
  lines; Filter Groupings is another with Overall: Group 2 and both group lines.
- Evidence: `/tmp/filter-dropdown-browser-final.log`,
  `/tmp/filter-column-top-layer.png`, `/tmp/filter-expression-results.png`,
  `/tmp/filter-expression-report.html`, `/tmp/filter-expression-report.xlsx`.
  All browser config/catalog/uploads/history/tracking used isolated home
  `/tmp/opencode/filter-dropdown-ui`; its temporary port 45305 server was stopped.
- Standard app at http://127.0.0.1:45303/ restarted directly to load report code,
  with no migration/catalog sync. Log `/tmp/filter-dropdown-standard-server.log`,
  PID file `/tmp/filter-dropdown-standard-server.pid`. Hard-refresh for the new
  frontend bundle. User configuration and data remain unchanged.

## Screenshot follow-up — heading alignment and duplicate filter text

The screenshot showed redundant presentation: a full expression, short hierarchy,
and flat clause list repeated the same single filter three times. Results now
show one expression only; a single filter omits unnecessary Filter 1 numbering.
Multi-filter expressions retain numbered predicates and all parentheses. Invalid
saved grouping still shows its error/diagnostic clauses. Standalone HTML clones
the same clean layout; direct backend HTML follows the single-filter wording.
Excel retains the separately requested numbered/multiline breakdown.

The Run now scope heading now shares the confirmation heading's horizontal
card-edge margins, while keeping zero negative top margin and 16px separation
from enabled rules. Chrome measured identical heading left edges/widths at
1600, 900 and 600px, with 16px vertical gaps. UI and downloaded HTML showed the
single expression exactly once and no page errors. Screenshots:
`/tmp/run-now-heading-aligned.png`, `/tmp/filters-single-line.png`.
Validation: 19 focused frontend checks; 22 report/backend checks; production
build/TypeScript, changed-file Ruff and diff whitespace check all passed.
