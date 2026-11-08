# Filter report and dropdown verification

Work performed directly on integration; no workers dispatched.
Coverage/design: `docs/20261109_filter_report_and_dropdown_fix.md`.

Full frontend suite: 661 passed / 3 skipped. Full backend suite: 797 passed
under isolated settings. Production build/TypeScript and mypy (96 source files)
passed. Changed-file Ruff and whitespace checks passed after updating the old
report-layout assertions for the new multiline filter cells/expression.

Browser verification and final disposition are recorded below when complete.

## Browser and export evidence

Chrome passed top-layer/hit-test assertions for both filter dropdown types.
Outside clicks on non-focusable content, focus leaving with Tab and Escape all
closed the menus; option interaction remained intact. An opening-click race in
native auto-popover mode was corrected by manual popovers with explicit dismissal.
No page errors in the final browser pass.

A real isolated run and both UI downloads passed. The Results and standalone
HTML lines preserve the full expression and numbered predicates. Reopened XLSX
has three Filters lines and Overall/Group 1/Group 2 lines in separate wrapped
cells. Evidence paths and exact sample expression are in the implementation doc.

Temporary 45305 server was stopped. Standard server 45303 has fresh backend code
and rebuilt assets; no startup migration/catalog synchronization was performed.

## Disposition

READY FOR USER UI VALIDATION. Final release frontend suite: 661 passed / 3
skipped; backend: 797 passed; build/TypeScript, mypy, changed-file Ruff and
whitespace checks passed. Existing Vite bundle-size advisory remains. User
functional acceptance is pending. No push or main merge was performed.
