# 2026-07-23 Results responsive display fix - worker instruction

## Evidence and reported defects

Use these screenshots as the visual reproduction references:

- [`Screenshot From 2026-07-23 10-05-36.png`](../screenshots/Screenshot%20From%202026-07-23%2010-05-36.png)
- [`Screenshot From 2026-07-23 10-05-54.png`](../screenshots/Screenshot%20From%202026-07-23%2010-05-54.png)
- [`Screenshot From 2026-07-23 10-06-07.png`](../screenshots/Screenshot%20From%202026-07-23%2010-06-07.png)

Fix these three issues on Page 3 Results:

1. Aggregation-statistics cards paint above the sticky report header. Report name, run time, and
   export controls must remain visually above all normal result content while sticky.
2. At narrower viewport widths, detail-table cell content disappears or becomes misaligned with its
   headers and neighboring cells. The table must remain coherent while horizontally and vertically
   scrolling.
3. Aggregation-statistics cards in the same row render with unequal heights. Cards in one visual row
   must have equal collapsed heights, without forcing unrelated rows to match.

## Scope and safety

- This is a focused presentation fix. Do not change aggregation calculations, detail data,
  pagination, filters, exports, report persistence, or family behavior.
- Preserve the sticky report header and sticky bottom action card required by Round 2.
- Preserve detail-table virtualization or replace its markup strategy only if necessary to make the
  existing data render reliably. Do not remove incremental loading or the ten-visible-row viewport.
- Preserve horizontal scrolling for wide tables. Do not squeeze all columns until values become
  unreadable, hide columns, or discard cell content at narrow widths.
- Work with the existing dirty tree. Do not overwrite or revert unrelated user/worker changes.
- Refresh `frontend/dist` only after source tests and the production build pass.

## Mandatory work -> test -> document loop

Complete each phase below sequentially. For each phase:

1. Inspect and reproduce the issue.
2. Make the smallest maintainable source change.
3. Run focused tests plus `git diff --check`.
4. Append findings, files changed, exact test results, and manual viewport results to
   `reviews/20260723_results_responsive_display_fix_review.md` before moving on.

If the screenshots cannot be reproduced, record the tested browser and viewport dimensions, then
validate the acceptance criteria directly rather than guessing at screenshot-specific offsets.

## Phase 1 - Correct sticky-header stacking

Inspect the complete stacking hierarchy involving:

- `.app-header`
- `.results-header`
- `.result-content` and ancestor stacking contexts
- `.group-stats-panel`, `.group-stats-row`, `.group-stats-card`
- detail-table sticky headers and filter popovers
- the sticky bottom result-actions card

Implement an explicit, documented layer order. The intended order from back to front is:

1. normal result content, including aggregation cards and tables;
2. sticky table headers within their own scroll container;
3. sticky bottom result actions;
4. sticky Results report header;
5. the global application header and intentionally opened dialogs/popovers.

Requirements:

- Give `.results-header` an opaque theme background across its full painted area. Content must not
  show through gaps created by wrapping or padding.
- Ensure the Results header's `top` offset remains below the global application header.
- Remove accidental stacking contexts from result content where they are unnecessary. Do not solve
  this with an arbitrarily huge `z-index`.
- Aggregation cards must scroll underneath, never on top of, the Results header.
- Table filter popovers must remain usable. If an open popover legitimately needs to overlay the
  Results header, document that explicit exception; otherwise contain it within the table region.
- Anchor jumps must still clear both sticky headers.

Add a structural regression test that asserts the dedicated sticky-header class and stacking-layer
classes are applied. Since jsdom does not calculate paint order, verify actual overlap manually.

## Phase 2 - Repair detail-table responsive layout and virtualization

The current table combines:

- one element as both horizontal and vertical scroll container;
- a `min-width` table;
- `display: block` on `<tbody>`;
- separate `display: table; table-layout: fixed` calculations for `<thead>` and every `<tr>`;
- absolutely positioned virtual rows.

This combination is the primary area to investigate. It can cause headers and body rows to compute
different column widths, and absolute virtual rows can be clipped or painted outside the expected
table geometry when the viewport narrows.

Implement one coherent table geometry:

- Header and body must use the same explicit column-width model. Width must not be independently
  recalculated for `<thead>` and each body row.
- Prefer valid semantic table layout. If virtual rows must remain positioned, use the virtualizer's
  supported table pattern with a shared grid/column template or measured spacer rows; do not rely on
  separate anonymous table layout algorithms.
- Keep a stable table content width of at least the sum of usable column minimums. The surrounding
  region owns horizontal scrolling.
- Account for the vertical scrollbar without shifting body columns relative to headers.
- Long values and rationale text may wrap within a sensible minimum width or remain horizontally
  scrollable, but they must not vanish, overlay another column, or be clipped without access.
- Every rendered row must expose exactly the same ordered cells as the header: all identifier/key
  columns, Column, In Baseline, In Comparison, and Rationale.
- Horizontal scroll position must not affect which virtual rows are mounted.
- Vertical scrolling must not blank non-empty cells. Rows entering the viewport must contain the
  correct values immediately.
- Sticky table headers must stay aligned at the left edge, at intermediate horizontal positions,
  and at the far-right edge.
- Filter buttons and dropdowns must remain aligned with their owning headers and keyboard usable.

Do not paper over the problem with `overflow: hidden`, fixed screenshot-specific widths, reduced
font size, or selectors that hide cell overflow.

### Required automated tests

Add or update `DetailTable` tests covering:

- several identifier columns plus the five standard detail fields;
- non-empty values in the first, middle, and last virtualized rows;
- stable header/body cell count and order;
- horizontal-scroll container structure and minimum-width/table-column contract;
- vertical scrolling that causes later virtual rows to render with their correct cell content;
- unchanged filter interaction and incremental `onReachEnd` behavior.

Use component-level assertions for data integrity and DOM structure. Do not claim that jsdom proves
pixel alignment.

### Required manual viewport matrix

Check at minimum these CSS viewport widths, at 100% browser zoom:

- 1280 px
- 1024 px
- 900 px
- 768 px
- 640 px
- 480 px, if the application permits the viewport this narrow

At every width:

- scroll the detail region vertically from first row to last loaded row;
- scroll horizontally to left, middle, and right;
- confirm header/body alignment and visible values;
- open a header filter dropdown near both horizontal edges;
- confirm page scrolling does not cause the table body to disappear.

Capture replacement screenshots at a wide and a narrow width and list their paths in the review.

## Phase 3 - Equal-height aggregation cards

Make cards in each `.group-stats-row` stretch to the height of the tallest card in that same row.

Requirements:

- Set the grid row/card alignment deliberately (`align-items: stretch` and an effective
  `height: 100%` or equivalent).
- Normalize the collapsed summary layout so a short label and a wrapping label still produce cards
  of equal outer height in the same row.
- The `<summary>` hit target should fill the collapsed card height and keep its disclosure marker,
  column name, Unique count, and Attribute count readable.
- Opening one `<details>` card may increase that row's height; sibling cards should continue to fill
  the row but must not display fake/duplicated table content.
- Rows with a different number of cards remain independent. Do not impose one fixed height on every
  aggregation card in the entire page.
- Preserve the current responsive column counts unless changing a breakpoint is necessary to stop
  unreadable wrapping. If a breakpoint changes, document why and verify all viewport widths above.
- Equal-height styling must not introduce a new stacking context above `.results-header`.

Add a component/structure test for the row/card classes and manually verify equal outer heights for:

- short and long aggregation-column names;
- single-line and wrapped summaries;
- collapsed cards;
- one expanded card in a row;
- the 4-, 3-, 2-, and 1-column responsive layouts.

## Phase 4 - Full regression and delivery

Run:

```bash
npm --prefix frontend test -- --run
npx --prefix frontend tsc --noEmit
npm --prefix frontend run build
git diff --check
```

If this repository's standard backend suite is practical, run `uv run pytest -q`; otherwise explain
in the review why a CSS/frontend-only fix did not require it. Do not report an unrun check as passing.

Confirm in the final review:

- each screenshot defect and its root cause;
- the exact CSS/markup/virtualization strategy chosen;
- wide and narrow manual verification results;
- focused and full automated test counts;
- refreshed `frontend/dist` asset names;
- unrelated pre-existing dirty files that were intentionally left untouched.

## Likely files

- `frontend/src/index.css`
- `frontend/src/features/results/DetailTable.tsx`
- `frontend/src/features/results/DetailTable.test.tsx` (new if no focused test exists)
- `frontend/src/features/results/GroupStatisticsPanel.tsx`
- `frontend/src/features/results/results.test.tsx`
- `frontend/src/pages/ResultsPage.tsx` only if a dedicated class/structure is needed
- `frontend/dist/*` after verification
- `reviews/20260723_results_responsive_display_fix_review.md`

## Definition of done

The fix is complete when aggregation cards always pass beneath the sticky Results header, detail
headers and non-empty cells remain aligned and visible through horizontal/vertical scrolling at all
required viewport widths, aggregation cards have equal heights within each visual row, automated
checks pass, replacement screenshots are recorded, the production bundle is refreshed, and the
review document contains the full work -> test -> document evidence.
