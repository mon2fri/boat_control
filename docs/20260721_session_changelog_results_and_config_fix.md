# Session Changelog — Results Page Polish, App Header, and Rules Config 500 Fix

**Date:** 2026-07-21
**Scope:** Results page UI refinements, app-wide header bar, config dropdown default, Expectation prefix on rule hints, 500 error fix when saving rules configs, and a 40-row sample CSV pair for realistic diffs.

All 222 frontend vitest + 133 backend pytest pass. `tsc -b` and the type checks on both sides are clean.

---

## 1. Bug Fix — 500 on `POST /api/rules/configs/`

Saving a rules config returned **500 Internal Server Error** because
`apps/configs/services.py::create_config` called `dict(content)` on the
rules array the frontend sends as `content`. `dict([...])` raises
`ValueError: dictionary update sequence element #0 has length 3; 2 is
required`.

### Root cause
- `ConfigManager` passes `currentContent` straight to `createConfig`. For
  rules that's `rules.data ?? []` (an array). For the other config
  types it's a dict, which is why the bug only surfaced for rules.
- The on-disk YAML needs a top-level mapping so `_version` can be stored
  alongside the payload, so the service *had* to wrap it — but the
  original code assumed the caller always handed it a mapping.

### Fix
- New `_wrap_for_storage(content)` helper in `services.py` — accepts
  dict or list. Lists are wrapped as `{"items": [...]}`. Anything else
  raises `ConfigNameError` with a clear message.
- New `_unwrap_from_storage(data)` helper — strips `_version`; if the
  only keys are `items` + `_version`, returns the original list.
  Otherwise returns the dict minus `_version`.
- `create_config` and `update_config` now wrap on write and return the
  **original** content (what the caller sent) — not the wrapped form.
- `get_config` and `list_configs` unwrap on read so the API contract is
  symmetric: *what you save is what you get back.*
- `ConfigFile.content` type widened from `dict[str, Any]` to `Any` to
  reflect the new contract; `_config_to_response` passes content
  through unchanged.

### Tests
- `tests/backend/test_configs.py`:
  - `test_create_with_list_content` — saves a rules array, asserts
    round-trip on create / get / list.
  - `test_update_with_list_content` — updates a list-content config
    from v1→v2, asserts content + version.
  - `test_rejects_non_dict_non_list_content` — scalar content is
    rejected with a clear error.
- `tests/backend/test_configs_api.py`:
  - `TestNamedRulesConfigsAPI.test_create_with_list_content` — POSTs
    `{"name": ..., "content": [...]}` to `/api/rules/configs/`, asserts
    201, then GETs the detail and asserts the list round-trips. This
    is the regression test for the exact 500 the user hit.

---

## 2. App-Wide Header Bar

The application name and theme toggle used to live in the sidebar nav,
making the sidebar feel like a brand strip rather than a navigation
surface. They're now in a dedicated header that spans the full page
width above both the sidebar and the main content.

### Changes
- `frontend/src/components/AppShell.tsx`: removed `nav-title-row`
  (app name + theme toggle) from `<nav>`. Added a new
  `<header className="app-header">` that holds the app name
  (`useSettings().applicationName`, fallback "Boat Control") and the
  theme toggle, with the sidebar and main content wrapped in a new
  `<div className="app-content">`.
- `frontend/src/index.css`:
  - New `--app-header-height: 56px` token so the sidebar's sticky
    offset stays in sync with the actual header height.
  - `.app-shell` switched from a 2-column grid to a vertical flex
    column (header on top, `.app-content` flex-1 below).
  - `.app-content` is now the 2-column grid (`220px 1fr`) that holds
    the sidebar and the main pane.
  - `.app-header` is `position: sticky; top: 0; z-index: 20` with
    `flex-shrink: 0` and `min-height: var(--app-header-height)` — it
    stays pinned to the viewport top as the page scrolls.
  - `.app-nav` sticks with `top: var(--app-header-height)` and
    `height: calc(100vh - var(--app-header-height))`, so it pins just
    below the header and doesn't slip under it.
  - Removed the now-unused `.app-nav h1` and `.nav-title-row` rules.

---

## 3. Results Page Refinements

### Page numbering
- `UploadPage.tsx` → `1. Upload & compare files`
- `PreparePage.tsx` → `2. Compare & validate`
- `ResultsPage.tsx` → `3. Results`

### Datetime + file-v-vs-file-2 hint
- The `baseline.csv vs candidate.csv` hint under the report name was
  replaced with `Ran on {toLocaleString(createdAt)}` so users see when
  the report was generated.

### "Run another report" button
- Added a primary `Run another report` button at the bottom of the
  results page, before the existing `View run history` button. It
  navigates to `/prepare` so the user can adjust filters/rules and
  re-run against the same uploads.

### TOC active-section highlight
- New `useActiveSection` hook in
  `frontend/src/features/results/useActiveSection.ts` uses
  `IntersectionObserver` with `rootMargin: "-25% 0px -50% 0px"` to
  track which section (`#overall`, `#changes`, or `#rule-{index}`)
  is currently in the viewport's trigger band.
- `TableOfContents` consumes the hook and marks the matching entry
  with `toc__item--active` and `aria-current="location"`. New
  `.toc__item--active > a` rule colors active links with the accent
  color and bolds them.

### `Expectation:` prefix on rule hints
- `frontend/src/features/results/RuleResultSection.tsx`: the rule-hint
  paragraph was rendering `<code>{logicSummary}</code>` with a
  visually-hidden `Rule logic:` prefix. Replaced with a visible
  `Expectation: ` label so the text now reads:
  > **Expectation:** `status equals "active"`

### Vertical alignment of the report header with the TOC
- The report-name + export-controls row was restructured into a
  flex row with `align-items: center` so the report name and the
  two export buttons share the same baseline.
- New `.results-header` (flex space-between, gap, wrap) and
  `.results-title-row` (inline-flex) CSS classes make the layout
  robust to long report names and the run-time hint.

---

## 4. `(new config)` Default in Config Dropdown

`frontend/src/features/configs/ConfigManager.tsx` used to show a
`<p className="card-hint">No named configs saved yet.</p>` placeholder
when a config type had no saved entries, and a dropdown with
`-- Select --` once entries existed. The placeholder is gone — the
dropdown is always rendered. When no configs exist, the only option
is `(new config)`; when configs exist, the dropdown defaults to
`-- Select --` followed by the named configs. The Load and Remove
buttons still only appear for a real selection.

---

## 5. Sample CSV Fixtures — 40 Rows Each

`baseline.csv` and `candidate.csv` at the repo root expanded from 10
to 40 rows. Same schema: `id,name,status,region,score`. Differences
are intentionally diverse so the comparison engine has something to
flag on every layer:

- **Rows removed** (in baseline only): `30, 39, 40` (Doug, Mona, Ned)
- **Rows added** (in candidate only): `41, 42, 43` (Oliver, Patricia, Quincy)
- **14 cell changes across 12 rows**, including:
  - Score drift: `1` (85→87), `8` (81→79), `10` (89→91), `25` (96→98)
  - Status flips: `2`, `13`, `15`, `22`, `35`
  - Region moves: `4` (West→North), `9` (North→West), `33` (North→South)
  - `4` and `33` each have two changed cells, exercising multi-field
    change diff rows.

This gives the comparison engine something to flag on every layer:
changed values, added rows, and removed rows. The structure mirrors
the original 10-row fixtures so existing rule fixtures (status, score
thresholds) will still match.

---

## Files Modified

| File | Change |
|------|--------|
| `frontend/src/components/AppShell.tsx` | App header above sidebar |
| `frontend/src/index.css` | `--app-header-height`, `.app-shell` flex column, `.app-content` 2-col grid, `.app-header`, `.app-nav` sticky offset, `.results-header`, `.results-title-row`, `.results-run-time`, `.toc__item--active` |
| `frontend/src/pages/UploadPage.tsx` | `1. ` prefix on title |
| `frontend/src/pages/PreparePage.tsx` | `2. ` prefix on title |
| `frontend/src/pages/ResultsPage.tsx` | `3. ` prefix; `Ran on …` datetime; `Run another report` button; results-header layout |
| `frontend/src/pages/RulesPage.tsx` | Action buttons wrapped in `.card` (matches UploadPage style) |
| `frontend/src/features/results/TableOfContents.tsx` | `useActiveSection` + `toc__item--active` |
| `frontend/src/features/results/useActiveSection.ts` | New: scroll-spy hook via `IntersectionObserver` |
| `frontend/src/features/results/RuleResultSection.tsx` | `Expectation: ` prefix on rule hint |
| `frontend/src/features/configs/ConfigManager.tsx` | Always render dropdown; `(new config)` default when empty |
| `backend/apps/configs/services.py` | `_wrap_for_storage` / `_unwrap_from_storage`; handle list content |
| `tests/backend/test_configs.py` | Regression tests for list content (create / update / scalar rejection) |
| `tests/backend/test_configs_api.py` | API regression test for `POST /api/rules/configs/` with list content |
| `baseline.csv` | Expanded from 10 → 40 rows |
| `candidate.csv` | Expanded from 10 → 40 rows |
