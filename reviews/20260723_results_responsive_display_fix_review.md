# 2026-07-23 Results responsive display fix — review

## Phase 1 — sticky-header stacking

### Finding and root cause

The Results header, bottom actions, table header, and aggregation cards did not have a documented,
isolated layer order. The Results header and bottom card both used `z-index: 10`, while descendants
could participate in the page stacking context. The supplied narrow screenshots show a group card
painting over the report name and controls.

### Change

- Added structural layer classes: `results-layer-content`, `results-layer-table-header`,
  `results-layer-actions`, and `results-layer-header`.
- `.result-content` now isolates its descendants at layer 0. Within it, table headers use layer 2,
  bottom actions layer 20, and the Results header layer 30. The global header remains layer 20 in
  the root context, above the isolated Results content.
- The Results header remains at `top: var(--app-header-height)` and has an opaque theme background.
- The bottom actions target their dedicated class rather than the fragile `:last-child` selector,
  and remain sticky at narrow widths.
- Anchor clearance now includes the global header and the wrapped Results header allowance.
- Filter dropdowns remain contained by the detail scroll region; they do not overlay the report
  header.

### Verification

- Structural regression assertion added to `frontend/src/journey.test.tsx`.
- Chrome overlap check at 1280 px deliberately placed group cards behind the sticky header and
  confirmed the header was opaque with computed `z-index: 30`.
- Focused/full tests and `git diff --check` results are recorded below.

### Files changed in this phase

- `frontend/src/index.css`
- `frontend/src/pages/ResultsPage.tsx`
- `frontend/src/journey.test.tsx`

## Phase 2 — detail-table geometry and virtualization

### Finding and root cause

The former semantic table mixed a block `<tbody>`, independently calculated fixed-layout `<thead>`
and `<tr>` tables, and absolutely positioned virtual rows. Header and body therefore calculated
columns independently. More importantly, the virtual body height used the server-side `total`
instead of the number of loaded rows known to the virtualizer. That created an unloaded scroll tail
where the table had height but no mountable rows—the blank cells visible in the supplied screenshots.

### Change

- Replaced the competing anonymous table layouts with one ARIA table/grid. Header and body rows use
  the exact same explicit pixel column template.
- Identifier columns are 150 px; Column is 150 px; baseline/comparison are 180 px each; Rationale is
  240 px. The grid minimum width is the sum of these columns and the surrounding region owns both
  axes of scrolling.
- Every body row exposes the same ordered cells as the header. Long cell values use local horizontal
  scrolling rather than disappearing or overlaying another column.
- The virtual height is now only `virtualizer.getTotalSize()` for loaded virtual rows. Short tables
  render their ten-or-fewer rows directly; longer tables preserve TanStack virtualization, overscan,
  ten-row viewport, and incremental loading.
- The scroll callback independently detects the loaded bottom while the existing virtual-index
  threshold remains in place. A per-load guard prevents duplicate `onReachEnd` calls.
- `aria-rowcount` communicates the server total without falsifying the mounted geometry.

### Automated verification

`frontend/src/features/results/results.test.tsx` now covers:

- two identifier columns plus all four standard detail columns;
- first, middle, and last values;
- equal ordered header/body cell counts;
- the 1050 px six-column minimum-width contract;
- capped vertical and horizontal scroll-region structure;
- filter interaction and incremental `onReachEnd` behavior;
- large-set virtualization.

### Real-browser verification

Chrome 140, browser zoom 100%, viewport height 900 px. At every width below, the first capped detail
region was scrolled vertically to its loaded bottom and horizontally to left, 50%, and far right.
At all three horizontal positions Chrome measured identical header/body left coordinates (under
1 px difference), equal cell counts, and non-empty mounted cells. The Column filter opened at both
horizontal edges and remained keyboard reachable. Page scrolling did not blank the body.

| Width | Columns | Header/body | Bottom row | Filter | Cards |
|---:|---:|---|---|---|---|
| 1280 px | 4 | aligned at left/middle/right | non-empty | usable | equal |
| 1024 px | 4 | aligned at left/middle/right | non-empty | usable | equal |
| 900 px | 3 | aligned at left/middle/right | non-empty | usable | equal |
| 768 px | 3 | aligned at left/middle/right | non-empty | usable | equal |
| 640 px | 2 | aligned at left/middle/right | non-empty | usable | equal |
| 480 px | 1 | aligned at left/middle/right | non-empty | usable | equal |

jsdom assertions cover DOM/data integrity only; the alignment claims above come from Chrome.

### Files changed in this phase

- `frontend/src/features/results/DetailTable.tsx`
- `frontend/src/features/results/results.test.tsx`
- `frontend/src/index.css`

## Phase 3 — row-scoped equal-height aggregation cards

### Finding and root cause

The former wrapping flex layout did not define stable visual rows; card height varied with wrapping
summary labels. It also could not independently express the intended 4/3/2/1 layouts.

### Change

- Each `group-stats-row` is a grid with `align-items: stretch`; each card is a full-height flex
  column. Height equality therefore applies only inside that row.
- Collapsed summaries fill their cards while retaining native `<summary>` marker behavior. Column
  names and counts are separate readable lines.
- Opening a card grows only its grid row; sibling cards stretch without receiving duplicated data.
- Responsive layouts are 4 columns normally, 3 at 900 px, 2 at 680 px, and 1 at 520 px. The final
  breakpoint was moved from 460 px so the required 480 px check exercises the one-column layout.

### Verification

- Component structure test asserts panel, row, card, and summary classes.
- Chrome measurements confirmed equal collapsed card heights at all viewport widths above, including
  short and wrapping column names. Grid stretch was also inspected with one card expanded; siblings
  filled the row and retained only their own content.

### Files changed in this phase

- `frontend/src/features/results/GroupStatisticsPanel.tsx`
- `frontend/src/features/results/results.test.tsx`
- `frontend/src/index.css`

## Phase 4 — regression and delivery

### Wide-viewport follow-up

The 2560 px reference screenshot revealed that minimum widths had become fixed widths on spacious
screens. Detail columns now use shared `minmax(minimum, fraction)` tracks and `.detail-grid` fills
its scroll region. Aggregation rows also receive a card-count class, so a row containing two cards
uses two equal tracks rather than leaving two empty tracks in the four-column layout. A Chrome check
at 2560 px measured a 2250 px aggregation row with two 1121 px cards, and a 2250 px detail region
with a 2248 px detail grid. Evidence: `screenshots/responsive_fix_wide_fill_2560.png`.

### Exact results

- Focused: `npm --prefix frontend test -- --run src/features/results/results.test.tsx` — 1 file,
  9 tests passed.
- Full frontend: `npm --prefix frontend test -- --run` — 32 files, 243 tests passed.
- The instructed `npx --prefix frontend tsc --noEmit` only printed TypeScript help under the installed
  npm/npx and did not type-check a project. Equivalent project-aware check `cd frontend && npx tsc
  --noEmit` passed with no errors.
- `npm --prefix frontend run build` — passed (227 modules transformed); Vite emitted only its existing
  chunk-size advisory.
- `uv run pytest -q` — 186 passed.
- `git diff --check` — passed with no output.

### Production assets

- `frontend/dist/assets/index-D-85ufaY.css`
- `frontend/dist/assets/index-Bd-RuXgL.js`

### Replacement screenshots

- `screenshots/responsive_fix_wide_1280.png`
- `screenshots/responsive_fix_narrow_480.png`
- `screenshots/responsive_fix_wide_fill_2560.png`

### Unrelated pre-existing dirty files intentionally left untouched

- `backend/apps/runs/views.py`
- `frontend/src/features/upload/HeaderReview.tsx`
- `config/families/`
- `config/rows_and_columns/s35.yaml`
- Existing source screenshots and the worker instruction under `planning/`

The prior `frontend/dist` hashes were replaced only after focused tests, type-check, and production
build succeeded.
