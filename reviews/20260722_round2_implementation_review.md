# 2026-07-22 Round 2 Implementation Review

## Phase 1 — Rename Grouping Columns to Aggregation Columns

### Requirement coverage
- E2-E9: E9 partial (card spacing addressed in Phase 6), E6-E8 addressed in Phase 7
- Confirmed decisions 1–17: Decision 1 (rename to aggregation) fully covered
- All UI labels, wire fields, backend fields, persisted run fields renamed to `aggregation_columns` / `aggregationColumns`
- Legacy readers fall back to `grouping_columns` when `aggregation_columns` is absent
- Rule grouping-tree terminology (GroupingLeaf, GroupingBranch, grouping_tree) preserved

### Files changed
- `backend/apps/runs/views.py` — variable rename, backward-compat reading of both keys, validation messages
- `backend/apps/runs/services.py` — function params, ExecutionResult field, local variables
- `backend/apps/runs/persistence.py` — save key, backward-compat load
- `backend/apps/runs/serializers.py` — field rename
- `frontend/src/state/WorkflowContext.tsx` — `groupingColumns` → `aggregationColumns`, action type rename
- `frontend/src/api/domain.ts` — `RunRequest.groupingColumns` → `aggregationColumns`
- `frontend/src/api/wire.ts` — `grouping_columns` → `aggregation_columns` (both in run request and result)
- `frontend/src/api/mapping.ts` — `mapRunRequestToWire` param rename
- `frontend/src/api/endpoints.ts` — `executeRun` request type rename
- `frontend/src/features/upload/HeaderReview.tsx` — props, labels, variable names
- `frontend/src/pages/UploadPage.tsx` — dispatch type update
- `frontend/src/pages/ResultsPage.tsx` — state reference rename
- `tests/backend/test_runs.py` — test method names, assertions, comments
- `frontend/src/api/mapping.test.ts` — test fixture
- `frontend/src/features/upload/HeaderReview.test.tsx` — test descriptions, accessible names
- `frontend/src/features/filters/useFullSetGuard.test.tsx` — test fixture
- `frontend/src/features/results/useRunExecution.test.ts` — test fixture

### Migration / compatibility behavior
- Save: writes only `aggregation_columns`
- Load: reads `aggregation_columns` first; falls back to `grouping_columns` with empty default
- View: accepts `aggregation_columns` from client, falls back to `grouping_columns` for in-flight clients
- Old persisted runs with only `grouping_columns` key continue to load correctly
- New persisted documents contain no `grouping_columns` key

### Tests and exact results
- `uv run pytest tests/backend/test_runs.py -q` — 27 passed
- `npm --prefix frontend test -- --run` — 32 files, 239 passed
- `uv run ruff check backend tests` — All checks passed
- `npm --prefix frontend run build` — tsc + vite build successful

### Manual checks
- `git diff --check` — no whitespace errors

### Remaining risks / follow-ups
- None for Phase 1 scope

## Phase 2 — Family storage, schema, settings, and CRUD API

### Requirement coverage
- Confirmed decisions 8–10, 12: Column Family, Value Family schema, config path
- Family name validation (`^[A-Za-z][A-Za-z0-9_]*$`), duplicate rejection
- Column Family with multiple columns, Value Family with owner/values
- Version-checked updates, confirmed delete
- Untrusted YAML handling: invalid files skipped in list endpoint
- Typed frontend wire schemas, domain types, mapping functions, endpoints, hooks

### Files changed
- `backend/boat_control/settings.py` — added `FAMILY_CONFIG_DIR`, installed `apps.families`
- `backend/boat_control/urls.py` — added family API routes
- `backend/apps/families/__init__.py` — new app
- `backend/apps/families/services.py` — family CRUD with validation
- `backend/apps/families/serializers.py` — DRF serializers
- `backend/apps/families/views.py` — API views (list, get, create, update, delete)
- `backend/apps/families/urls.py` — URL configuration
- `backend/apps/settings/services.py` — added `family_config_path`, `get_family_config_dir()`
- `backend/apps/settings/serializers.py` — added `family_config_path` field
- `backend/apps/settings/views.py` — added `family_config_path` to response
- `frontend/src/api/domain.ts` — added `familyConfigPath` to `AppSettings`, family types
- `frontend/src/api/wire.ts` — added `family_config_path` to settings schema, family wire schemas
- `frontend/src/api/mapping.ts` — settings mapping update, family mapper functions
- `frontend/src/api/endpoints.ts` — added family CRUD API functions
- `frontend/src/features/settings/useSettings.ts` — added family Query/Mutation hooks
- `frontend/src/pages/SettingsPage.tsx` — added family config path field
- `frontend/src/pages/SettingsPage.test.tsx` — updated test fixture
- `tests/backend/test_settings.py` — updated expected defaults
- `tests/backend/test_families.py` — 12 new test cases
- `frontend/tests/integration-fixtures/e2e_responses.json` — added `family_config_path`

### Documentation created
- `docs/20260722_family_config_api.md` — family schema, validation, endpoints

### Migration / compatibility behavior
- New `.config` files include `family_config_path` defaulting to `config/families`
- Existing `.config` files without the key get the default on load
- Family YAML files are validated on read; invalid files are skipped in list endpoint

### Tests and exact results
- `uv run pytest tests/backend/test_families.py -q` — 12 passed
- `uv run pytest -q` — 159 passed (147 original + 12 new)
- `npm --prefix frontend test -- --run` — 32 files, 239 passed
- `uv run ruff check backend tests` — All checks passed
- `npm --prefix frontend run build` — tsc + vite build successful

### Manual checks
- `git diff --check` — no whitespace errors

### Remaining risks / follow-ups
- Family management UI and contextual entry points deferred to Phase 4
- Config family-reference round trips deferred to Phase 5

## Phase 3 — Shared family resolution semantics

### Requirement coverage
- Confirmed decisions 3–7, 10: Column Family expansion, ANY/ALL semantics, column-against-column family intersection
- Shared resolver implemented in `backend/apps/families/resolver.py`
- `available_members()`, `missing_members()`, `is_selectable()` — family availability queries
- `expand_column_references()` — expands `family:Name` prefixed references to effective columns
- `evaluate_family_predicate()` — evaluates a single row value against operator+values
- `evaluate_rule_predicate_for_family()` — evaluates rule predicate across a Column Family with ANY (positive) and ALL (negative) semantics
- Column-vs-column with families on both sides: intersect member names, compare only shared members
- Value Family value retrieval (`get_value_family_values()`) and Column Family union values (`get_column_family_union_values()`)

### Files changed
- `backend/apps/families/resolver.py` — new shared resolver module
- `tests/backend/test_family_resolver.py` — 27 test cases covering all predicate and expansion scenarios

### Tests and exact results
- `uv run pytest tests/backend/test_family_resolver.py -q` — 27 passed
- `uv run pytest -q` — 186 passed
- `npm --prefix frontend test -- --run` — 32 files, 239 passed
- `uv run ruff check backend tests` — All checks passed

### Manual checks
- `git diff --check` — no whitespace errors

### Remaining risks / follow-ups
- Config family-reference round trips (rules, rows/columns config) deferred to Phase 5

## Phase 4 — Family management UI and contextual entry points

### Requirement coverage
- Confirmed decisions 11–15: FamiliesPage, FamilyEditor, AppShell nav item, Column Family column filter integration, Load config on Upload, Add value family buttons on Prepare page
- FamiliesPage with list of column/value families, create/edit/delete inline
- FamilyEditor dialog accessible from FamiliesPage (create and edit) and from Upload page (add column family)
- AppShell navigation: "Column/Value Family" item added
- Upload page: Column Family loader inside Column filter card (select dropdown union available members), "Add column family" button, "Load config for rows and columns" via ConfigManager
- Prepare page: ValueFamilyAddButton appears in FilterRowEditor when a column is selected, and in RuleEditor condition/logic value sections when a column is selected
- ValueFamilyAddButton queries `useFamilies()` to find value families matching the selected column (by owner or owner column family), shows matching families in a dropdown, merges values on click

### Files changed
- `frontend/src/pages/FamiliesPage.tsx` — new page for family management
- `frontend/src/features/families/FamilyEditor.tsx` — reusable create/edit family dialog
- `frontend/src/features/families/ValueFamilyAddButton.tsx` — dropdown button to add value family values
- `frontend/src/components/AppShell.tsx` — added "Column/Value Family" nav item
- `frontend/src/router.tsx` — added `/families` route
- `frontend/src/features/upload/HeaderReview.tsx` — added Column Family loader dropdown, "Add column family" button, FamilyEditor integration
- `frontend/src/pages/UploadPage.tsx` — added ConfigManager/ConfigLoader for rows-and-columns config, handleConfigLoad dispatcher
- `frontend/src/features/filters/FilterRowEditor.tsx` — added ValueFamilyAddButton
- `frontend/src/features/rules/RuleEditor.tsx` — added ValueFamilyAddButton in condition and logic value sections
- `frontend/src/features/upload/HeaderReview.test.tsx` — wrapped in QueryClientProvider (required by useFamilies)
- `frontend/src/features/rules/RuleEditor.test.tsx` — wrapped in QueryClientProvider (required by ValueFamilyAddButton via useFamilies)

### Documentation created
- None (Phase 4 adds no new API endpoints or semantics)

### Migration / compatibility behavior
- No migration needed; all additions are additive UI changes

### Tests and exact results
- `uv run pytest -q` — 186 passed
- `npm --prefix frontend test -- --run` — 32 files, 239 passed
- `uv run ruff check backend tests` — All checks passed
- `npm --prefix frontend run build` — tsc + vite build successful

### Manual checks
- `git diff --check` — no whitespace errors

### Remaining risks / follow-ups
- Rules config family-reference round trips deferred to Phase 5d
- ValueFamilyAddButton dropdown lacks styling polish (plain unstyled `<ul>`)
- Phase 6: Card spacing and layout refinements
- Phase 7: Onboarding flow, error messages, empty states
- Phase 8: Full E2E integration tests

## Phase 5 — Config references and compatibility

### Requirement coverage
- Confirmed decisions 11, 13, 15–17: tagged references in configs, legacy loader compat, warning reporting
- Decision 11: Rules/rows configs may store family references (rows/columns config implemented; rules config deferred)
- Decision 13: Loading a config does not silently resolve families; tagged references preserved on save
- Decision 15: Load config available on both Upload and Compare & validate pages, does not replace files or Column Filter
- New `configContent.ts` module with `ColumnRef`/`ValueRef` tagged union types, resolver functions
- `resolveRowsColumnsConfig()` resolves tagged config content against families and available columns, returns resolved state + warnings
- `mapWorkflowToRowsColumnsConfig()` converts workflow state to tagged config content, collapsing column sets into family references when all members are present
- Column Family references: `{kind: "column_family", name: "..."}` — expands to available members
- Legacy bare-string column references continue to work
- Warning types: `missing_family`, `zero_member_family`, `partial_family`, `excluded_column`
- Config save on Upload and Prepare pages uses tagged format (family refs where all members present, otherwise bare strings)
- Config load on both pages resolves references and displays warnings in `alert--warn` banners

### Files changed
- `frontend/src/api/configContent.ts` — new module: `ColumnRef`, `ValueRef`, `ConfigFilterRow`, `RowsColumnsConfigContent`, `ConfigLoadWarning`, `ConfigLoadResult` types; `resolveColumnRef()`, `resolveValueRef()`, `resolveConfigFilterRow()`, `resolveRowsColumnsConfig()`, `mapWorkflowToRowsColumnsConfig()`, `columnToRef()`, `columnsToRefs()` functions
- `frontend/src/pages/UploadPage.tsx` — added `useFamilies()`; `handleConfigLoad` rewritten to use `resolveRowsColumnsConfig()`; `currentContent` uses `mapWorkflowToRowsColumnsConfig()`; config load warnings displayed; removed `FilterRow` import
- `frontend/src/pages/PreparePage.tsx` — added `useFamilies()`; `handleConfigLoad` rewritten to use `resolveRowsColumnsConfig()`; `currentContent` uses `mapWorkflowToRowsColumnsConfig()`; removed unused `prepareConfigContent` and `FilterRowType` import

### Documentation created
- None (no new API endpoints; config content format detailed inline in `configContent.ts`)

### Migration / compatibility behavior
- Legacy configs with bare string column references load correctly (resolver treats strings as legacy columns)
- New configs are saved with tagged references (`{kind:"column_family",...}`) when all family members are present in the state
- Individual columns that happen to be family members but not all members present are saved as bare strings
- Upload page: config loading does not replace files or Column Filter; resolves against `state.header.common`
- Prepare page: config loading resolves against current `comparisonColumns`
- Both pages display timed warnings for missing/partial/excluded families

### Tests and exact results
- `uv run pytest -q` — 186 passed
- `npm --prefix frontend test -- --run` — 32 files, 239 passed
- `uv run ruff check backend tests` — All checks passed
- `npm --prefix frontend run build` — tsc + vite build successful

### Manual checks
- `git diff --check` — no whitespace errors

### Remaining risks / follow-ups
- No frontend unit tests yet for `configContent.ts` resolver functions (tested implicitly through existing page/snapshot tests)

## Phase 5d — Rules config family references

### Requirement coverage
- Confirmed decisions 11, 16: rules config content supports `ColumnRef`/`ValueRef` tagged references
- New `ConfigRule`, `ConfigRuleCondition`, `ConfigRuleLogic`, `RulesConfigContent` types in configContent.ts
- `resolveConfigRuleCondition()`, `resolveConfigRuleLogic()`, `resolveConfigRule()`, `resolveRulesConfig()` — resolve tagged rule config against families and available columns
- `resolveValuesRefs()` — resolves `ValueRef[]` to flat string[], collecting warnings
- `isDomainRulesFormat()` — detects old-format (domain `Rule[]`) vs new-format (`ConfigRule[]`) configs
- `mapRulesToConfigContent()` — converts domain `Rule[]` to `ConfigRule[]` with tagged references
- `columnToRef()` / `valuesToValueRefs()` — find family references for columns/values on save
- `ColumnsToRefs()` — collapses column sets into family references when all members present
- RulesPage ConfigManager uses tagged format for `currentContent`
- RulesPage ConfigLoader now properly applies saved config content (resolves families, deletes existing rules, creates new ones via API)
- Old-format configs (domain Rule objects) load correctly without family resolution

### Files changed
- `frontend/src/api/configContent.ts` — added `ConfigRuleCondition`, `ConfigRuleLogic`, `ConfigRule`, `RulesConfigContent` types; `resolveConfigRuleCondition()`, `resolveConfigRuleLogic()`, `resolveValuesRefs()`, `resolveConfigRule()`, `isDomainRulesFormat()`, `resolveRulesConfig()`, `ruleToConfigRule()`, `mapRulesToConfigContent()`, `conditionColumnToRef()`, `valuesToValueRefs()` functions
- `frontend/src/pages/RulesPage.tsx` — added `useFamilies()`; `currentContent` uses `mapRulesToConfigContent()`; added `loadedConfigData` state, `handleConfigContent` callback, `useEffect` for async config processing (resolve families, delete existing rules, create new ones); config warnings displayed; `isApplyingConfig` loading indicator

### Migration / compatibility behavior
- Old-format rules configs (domain `Rule[]` with camelCase fields) detected by `isDomainRulesFormat()` and loaded without family resolution
- New-format configs use `ConfigRule[]` with snake_case `column_name` and `ColumnRef`/`ValueRef` tagged references
- Config load triggers sequential deletion of existing rules and creation of resolved config rules via API
- Warnings shown for missing/partial families

## Phase 6 — Card spacing and layout refinements

### Requirement coverage
- Decision E9: Rule-selection area wrapped in one card from "Select rules for this run" through "+ Add rule"
- `rule-select-panel` now has `card` class in embedded RulesPage
- "Run comparison and validation" card has `margin-top: calc(var(--space) * 2)` spacing from the rule card
- Same spacing applied in both embedded and standalone RulesPage paths
- 25/75 selection/editor grid layout preserved
- Focused layout test validates both cards are present and distinct

### Files changed
- `frontend/src/pages/RulesPage.tsx` — added `card` class to `rule-select-panel`; added `marginTop` to run action card (both embedded and standalone paths)
- `frontend/src/pages/RulesPage.test.tsx` — added layout test verifying rule selection card and run action card

### Documentation created
- None (CSS-only changes)

## Phase 7 — Results navigation and sticky controls

### Requirement coverage
- Confirmed decisions E6-E8: TOC in AppShell nav on /results, sticky header, sticky footer action buttons
- `TableOfContents` moved from `ResultsPage` content area to `AppShell` nav on `/results` and `/results/:runId` routes
- TOC appears below primary navigation items inside a `.app-nav__results` section with visual border-top separator
- TOC uses `variant="nav"` in AppShell (no card wrapper) vs `variant="sidebar"` (original card layout, preserved for tests)
- `useWorkflow()` provides result data to AppShell without duplicating fetching
- `.results-header` is now sticky at `top: var(--app-header-height)` with opaque background, border, and z-index
- Final action card (Run another report / Edit filters / View history) is sticky at `bottom: 0` until natural end position
- Narrow-screen fallback: final card switches to `position: static` at ≤720px
- `scroll-margin-top` added to `#overall`, `#changes`, `[id^="rule-"]` sections to clear sticky header on anchor jumps
- No result: TOC is omitted (no loading label)

### Files changed
- `frontend/src/components/AppShell.tsx` — added `useLocation`, `useWorkflow`, `TableOfContents` imports; `isResultsRoute` check; TOC rendering inside `app-nav` with `.app-nav__results` wrapper
- `frontend/src/features/results/TableOfContents.tsx` — refactored `TocLinks` sub-component; added `variant` prop (`"sidebar"` | `"nav"`); nav variant omits card wrapper and renders minimal links
- `frontend/src/pages/ResultsPage.tsx` — removed `TableOfContents` import and usage; removed `result-layout` grid wrapper; fixed extra closing div
- `frontend/src/index.css` — `.results-header` sticky positioning; `.result-content .card:last-child` sticky bottom; `.app-nav__results` styles; scroll-margin-top for result sections; narrow-screen fallback

### Migration / compatibility behavior
- TOC no longer appears inline in results content area; now in navigation sidebar on /results routes
- Existing test rendering `TableOfContents` standalone still works (default `variant="sidebar"`)
- Sticky header/footer use CSS positioning only (no JavaScript scroll handlers)
- Anchor scrolling cleared by `scroll-margin-top`

## Phase 8 — Verification and delivery

### Checks run
- `uv run pytest -q` — 186 passed
- `uv run ruff check backend tests` — All checks passed
- `npm --prefix frontend test -- --run` — 32 files, 240 passed
- `npx --prefix frontend tsc --noEmit` — No errors
- `npm --prefix frontend run build` — Successful (tsc -b && vite build)

### Manual checks
- `git diff --check` — no whitespace errors

### Deferred / known gaps
- No frontend unit tests for `configContent.ts` resolver functions
- ValueFamilyAddButton dropdown lacks styling polish
- No browser E2E journey test for family → config → run flow
- Sticky header/footer geometry not tested in jsdom (requires browser verification)

## Post-Phase-8 tweaks

### Changes made
- **ConfigManager inside HeaderReview**: Moved the "Load config for rows and columns" card into the `HeaderReview` component as a `configManager` prop, rendered in the same flex row as the "Column preview" heading (side-by-side)
- **Column filter 2-column grid**: "Select columns to include" (`SearchableMultiSelect`) and "Select column family" dropdown are now side-by-side inside a `card-grid-2` layout within the "Column filter" card
- **Label change**: "Load column family" → "Select column family"
- **Save to config button**: Added "Save to config" button in `ConfigManager` when a config is selected from the dropdown; calls `updateConfig` (PUT) with the selected config name, current content, and version number
- **Heading row spacing**: Added `marginBottom: "var(--space)"` to the heading flex row to preserve spacing between "Column preview" and its hint text

### Files changed
- `frontend/src/features/upload/HeaderReview.tsx` — added `configManager?: ReactNode` prop; heading row wrapped in flex container; column filter + family select in `card-grid-2`
- `frontend/src/pages/UploadPage.tsx` — `<ConfigManager>` moved into `<HeaderReview>` as `configManager` prop
- `frontend/src/features/configs/ConfigManager.tsx` — added `useUpdateConfig`; "Save to config" button when a config is selected; update success/error alerts

### Tests
- `npm --prefix frontend test -- --run` — 240 passed
