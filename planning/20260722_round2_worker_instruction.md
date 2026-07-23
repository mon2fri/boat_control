# 2026-07-22 Round 2 implementation plan and worker instruction

Source: [`requirements/20260722_bug_enhancement.md`](../requirements/20260722_bug_enhancement.md),
Round 2 items E2-E9.

## Confirmed product decisions

These decisions were confirmed on 2026-07-22 and are requirements, not worker discretion:

1. Rename **Grouping Columns** to **Aggregation Columns** consistently in the UI, frontend domain
   and workflow state, wire/API fields, backend services, and persisted run documents. Do not leave a
   mixture of grouping and aggregation terminology.
2. A Column Family may be selected anywhere an individual column may be selected: Filtering Rows,
   Comparing Columns, Identifier Columns, Aggregation Columns, rule conditions, and rule logic.
3. A Column Family is selectable for the current upload when at least one family member is present
   in both uploaded files. A family with no currently available members remains editable/removable
   but cannot be selected.
4. At execution time, a selected Column Family expands to its currently available member columns.
5. For a positive predicate against a Column Family, a row matches if **any** available member
   column matches. Example: `Contact equals "abc"` means `email equals "abc" OR phone equals
   "abc"`.
6. Negative predicates are the logical inverse of the corresponding positive family predicate and
   therefore require **all** available members to pass the negative test. Example: `Contact does not
   equal "abc"` means `email does not equal "abc" AND phone does not equal "abc"`. Apply the same
   rule to other positive/negative pairs such as contains/does-not-contain.
7. When both operands of column-against-column rule logic are Column Families, compare only members
   having the exact same column name in both families. Compare each shared name with itself across
   the two uploaded file versions. Ignore members present in only one family. For example,
   `[col_x, col_y, col_z]` against `[col_w, col_x, col_y]` compares `col_x` with `col_x` and `col_y`
   with `col_y`; `col_z` and `col_w` have no counterpart and are not evaluated.
8. Each Value Family belongs to exactly one individual column or one Column Family. All stored
   family values are strings. Values within a Value Family are OR-ed.
9. A Value Family is offered only when its associated individual column or Column Family is the
   selected operand in the filter, rule condition, or rule logic control.
10. Column and Value Families are global saved configuration. Add a setting and config path with the
   default `config/families`, parallel to the existing rules and rows/columns configuration paths.
11. Rules configurations and rows/columns configurations may store references to families. Resolve
    references by stable family identity/name when loading; do not silently copy a family's members
    into the referring config.
12. Editing a saved family while the current upload lacks some of its stored columns/values must
    preserve those unavailable members. The editor may remove them but must not force their removal.
    Users may add only columns/values available in the current upload.
13. Loading a Column Family on Upload adds its currently available member columns to the existing
    Column Filter selection without clearing current selections.
14. Put **Add column family** inside the existing **Column filter** card.
15. Make **Load config for rows and columns** available on Upload after header inspection as well as
    on Compare & validate. Loading it must not replace the uploaded files or the current Column Filter.
16. On Results, place the table of contents beneath the existing primary navigation items and show
    it there only on Page 3.
17. On Results, the three final action buttons are sticky at the viewport bottom until their natural
    end-of-page position is reached. Report name, run time, and both export buttons are sticky at the
    viewport top unless the user is at the natural top position.

## Scope and guardrails

- Assign this entire instruction to **one worker**. Complete phases sequentially; do not split the
  implementation across parallel workers.
- Implement only E2-E9 plus the confirmed decisions above.
- Preserve the July 21 behavior for comparison-file filtering, grouping/aggregation statistics,
  detail filters, rule evaluation, persistence, pagination, exports, and report history.
- Preserve existing config optimistic-version handling and safe file-backed writes.
- Keep family definitions global; do not tie their lifetime to an upload session or report.
- Never delete unavailable family members merely because the current upload does not contain them.
- Family expansion must be deterministic, de-duplicated, and ordered by the underlying uploaded
  column order. Selecting a family and one of its members must not execute that column twice.
- Persist references in authoring configurations, but persist the resolved effective column names
  in a completed run so historical results do not change when a family is later edited.
- Do not add external assets or a frontend runtime build dependency. Commit refreshed
  `frontend/dist` output.
- Maintain keyboard access, visible focus, usable narrow-screen layouts, and appropriate accessible
  names/status announcements.

## Mandatory phase loop: work -> test -> document

For **every phase**, the worker must finish this loop before starting the next phase:

1. **Work**
   - Inspect the affected implementation and existing tests first.
   - Implement only that phase's scoped changes.
   - Keep compatibility adapters and migrations explicit; do not postpone them to the final phase.
2. **Test**
   - Run the smallest relevant tests and static checks while developing.
   - When the phase is complete, run all backend and frontend tests materially affected by it.
   - Fix failures before proceeding. A failing phase cannot be carried into the next phase unless the
     failure is proven unrelated and recorded with evidence.
3. **Document**
   - Create and maintain
     `reviews/20260722_round2_implementation_review.md`.
   - Append a section for the completed phase containing: requirement coverage, decisions applied,
     files changed, migrations/compatibility behavior, tests and exact results, manual checks, and
     any remaining risks or follow-ups.
   - Mark the phase complete in that review only after its scoped tests pass.

At each phase boundary, inspect the working diff for accidental unrelated edits and run
`git diff --check`. The review document is a living implementation log, not a retrospective written
only after all coding is complete.

If a phase exposes a missing product decision that materially changes persisted data, API behavior,
or rule semantics, stop and ask the user before choosing a behavior. Record the question in the
review document, but do not mark the phase complete. Minor implementation details that preserve the
specified contract remain worker discretion.

## Phase 1 - Rename Grouping Columns to Aggregation Columns

Use `aggregation` as the canonical term at every layer:

- `WorkflowState.groupingColumns` -> `aggregationColumns`
- reducer action `setGroupingColumns` -> `setAggregationColumns`
- domain request/result fields -> `aggregationColumns`
- wire/API request and response field -> `aggregation_columns`
- backend function arguments, dataclass fields, serializers, validation messages, and local names
- persisted run field -> `aggregation_columns`
- UI labels, hints, test names, documentation, and comments

The statistics result can retain the generic concept name `group_statistics` if desired; rename
only concepts that specifically describe the selected columns. Do not rename unrelated rule
condition grouping-tree terminology.

### Compatibility migration

Existing saved runs and in-flight clients may contain `grouping_columns`. During a compatibility
window, readers must accept `aggregation_columns` first and fall back to `grouping_columns` when the
canonical field is absent. New writes and responses emit only `aggregation_columns`. Frontend wire
parsing may accept the legacy alias, but domain state must expose only `aggregationColumns`.

Update fixtures and tests to prove:

- a new run round-trips `aggregation_columns`;
- a legacy persisted run containing only `grouping_columns` still loads;
- new persisted documents contain no `grouping_columns` key;
- all visible **Grouping Columns** text becomes **Aggregation Columns**, while rule grouping UI is
  unchanged.

## Phase 2 - Family storage, schema, settings, and CRUD API

Add a fourth configurable filesystem path:

- backend/project setting: use the repository's existing uppercase naming convention, e.g.
  `FAMILY_CONFIG_PATH`;
- settings API field: `family_config_path`;
- frontend domain field: `familyConfigPath`;
- default: `config/families`;
- Settings page field: **Column/Value Family Config Path**.

Update `.config` loading/writing, settings serializers, views, frontend wire/domain mappings, form
validation, and tests. Preserve existing settings when upgrading a `.config` file that lacks the
new key by supplying the default.

Add dedicated family endpoints parallel to named configs. A single family store may contain both
types, but the schema must distinguish them explicitly. Recommended canonical records:

```text
ColumnFamily {
  kind: "column"
  name: string
  columns: string[]
}

ValueFamily {
  kind: "value"
  name: string
  owner: { kind: "column" | "column_family", name: string }
  values: string[]
}
```

Requirements:

- Names must match `^[A-Za-z][A-Za-z0-9_]*$` at both UI and API boundaries.
- Names are unique within their family kind. Reject duplicates with a clear 400 response; do not
  overwrite through create.
- Preserve member order while removing duplicates.
- A Column Family must contain multiple columns when created. An existing partially compatible
  family may temporarily resolve to one available column without mutating its saved definition.
- A Value Family must contain multiple unique string values and exactly one owner.
- Provide list, get, create, version-checked update, and confirmed delete behavior using the current
  config service's atomic-write and conflict conventions.
- Reject malformed kinds, owners, names, columns, and non-string values server-side.
- When deleting a family referenced by a rules or rows/columns config, do not corrupt that config.
  Allow deletion, then show a clear unresolved-reference warning when the referring config loads.
- Treat YAML contents as untrusted input: validate loaded records before returning them and surface
  invalid files without crashing the whole list endpoint.

Add typed frontend wire schemas, domain types, mappings, endpoints, and query/mutation hooks. Do not
pass family payloads around as unchecked `unknown` beyond the existing config-loader boundary.

## Phase 3 - Shared family resolution semantics

Implement one shared resolver rather than duplicating family logic in each page.

For a current upload, derive:

- `availableColumns`: columns present in both uploaded files and retained by the current Column
  Filter where that control requires the filtered set;
- `availableMembers(family)`: saved family columns intersected with current eligible columns;
- `missingMembers(family)`: saved family columns absent from the current eligible columns;
- `selectable`: `availableMembers.length >= 1`.

Family selectors must visibly distinguish individual columns from Column Families. Include the
family name and, where useful, its available member count. Disable zero-member families and explain
why. When only some members are available, allow selection but show a warning naming ignored
members and stating that only available members participate in comparison and validation.

Expansion rules:

- Comparing Columns: expand selected families to effective comparison columns.
- Identifier Columns: expand before forming the composite key; all resolved member columns are key
  components.
- Aggregation Columns: expand to one statistics dimension per resolved member column.
- Filter/rule column operand: retain the family operand in editable state/config, then evaluate the
  predicate across members using `ANY` for positive predicates and `ALL` for their negative inverse.
- When both sides of rule column-against-column logic are families, intersect their resolved member
  names and compare only identical names. Each comparison is between that column's baseline and
  comparison-file values, consistent with existing column-against-column direction. Ignore
  non-intersecting members rather than pairing by position or taking a Cartesian product. If the
  resolved intersection is empty, block execution and identify the incompatible families instead of
  silently treating the rule as passing.

Value options for a selected Column Family are the de-duplicated union of unique comparison-file
values from every currently available member column. Keep all values as strings at the family
authoring boundary. Preserve current null/empty display behavior; do not silently collapse those
two values.

Value Family use must behave like selecting all of its member values directly:

- the family appears only for its exact owner operand;
- all family values are OR-ed within the predicate;
- negative operators retain existing literal multi-value semantics for values, while Column Family
  expansion still follows the confirmed `ALL` negative-member rule;
- configurations retain the family reference, while execution snapshots resolved values.

Add backend tests for positive and negative predicates, partial availability, duplicate expansion,
family plus direct-column selection, identifier expansion, aggregation expansion, and unavailable
families.

## Phase 4 - Family management and contextual entry points

### Common navigation entry

Add **Column/Value Family** to primary navigation and create a management page that lists Column
Families and Value Families separately. It must support add, edit, and remove for both kinds.

The editor must:

- validate names as the user types and again on submit;
- use searchable multi-selects;
- for a Column Family, offer columns known from the current inspected upload when one exists;
- for a Value Family, require one column or one Column Family owner and load the owner's union of
  comparison-file values;
- preserve unavailable stored members during editing and render them as unavailable tags;
- prohibit adding columns or values not available in the current upload;
- remain usable without an active upload for viewing, renaming, removing, and removing stored
  members, but not for adding data-dependent members.

### Upload page

After header inspection:

- Add a Column Family selector in the same row/section as **Column preview**.
- Selecting **Load family** unions its available members into Column Filter without clearing the
  current selection, key columns, or aggregation columns.
- Show partial/invalid compatibility notices before application. A zero-member family cannot be
  selected.
- Put **Add column family** inside the **Column filter** card. Open the shared family editor and
  refresh selectors after a successful save.
- Add **Load config for rows and columns** on Upload. Loading a config must restore its filtering
  rows, Comparing Columns, Identifier Columns, Aggregation Columns, and family references, but must
  not change files or Column Filter.
- Filter loaded direct columns and resolved family members against the current Column Filter. List
  every discarded/unresolved reference in a warning. Identifier Columns must remain non-empty
  before Continue is enabled.

### Compare & validate page

- Place **Add value family** immediately to the right of **+ Add filter**.
- Place **Add value family** immediately to the right of each relevant **+ Add condition** entry.
- The dialog inherits the currently selected column/Column Family as owner when unambiguous;
  otherwise require the owner to be selected.
- Refresh available Value Families immediately after saving without discarding editor state.

Use a reusable dialog/editor rather than duplicating family forms across pages.

## Phase 5 - Config references and compatibility

Extend rows/columns config content to save and load:

- filtering rows, including direct-column or Column Family operand references;
- Comparing Columns, including family references;
- Identifier Columns, including family references;
- Aggregation Columns, including family references.

Extend rules configs so condition and logic operands and values may reference Column and Value
Families. Use explicit tagged references rather than magic string prefixes, for example:

```text
{ kind: "column", name: "status" }
{ kind: "column_family", name: "Contact" }
{ kind: "values", values: ["active"] }
{ kind: "value_family", name: "ActiveStates" }
```

Maintain loaders for legacy configs containing bare column strings and direct value arrays. New
writes use the tagged representation. Loading must report, without crashing:

- missing family references;
- zero-member families for this upload;
- partially available families and ignored members;
- direct columns excluded by the current Column Filter;
- Value Families whose owner no longer matches the selected operand.

Do not silently substitute another family or owner. Preserve unresolved references in the editor
where possible so the user can repair the configuration.

## Phase 6 - Page 2 card spacing and rule-list card (E9)

On Compare & validate:

- Wrap the complete rule-selection area, from **Select rules for this run** through **+ Add rule**,
  in one card.
- Keep the existing approximately 25/75 selection/editor layout within that card where practical.
- Ensure the card containing **Run comparison and validation** has normal section spacing above it
  and does not visually touch the rule card.
- Preserve embedded rule editing, validation messages, config controls, and mobile stacking.

Add a focused component/layout test that verifies card boundaries and action placement rather than
asserting fragile CSS pixel values.

## Phase 7 - Results navigation and sticky controls (E6-E8)

Move `TableOfContents` rendering into the AppShell navigation area on `/results` and
`/results/:runId` only. It appears after the primary navigation list with deliberate visual spacing.
Provide it the loaded result through a small shared results-navigation context or route-aware state;
do not duplicate result fetching in AppShell. When the result is still loading, omit the contents
list or show a compact non-interactive loading label.

Retain semantic separation:

- the main application links remain in the **Primary** navigation;
- the result anchors remain in a nested/separate navigation labelled **Result contents**;
- active-section highlighting and keyboard anchor navigation continue to work;
- account for the sticky results header when scrolling to anchors via `scroll-margin-top`.

Results controls:

- Make `.results-header` sticky at the top of the viewport with an opaque themed background,
  border/shadow, sufficient `z-index`, and safe wrapping. It contains report name, run time, Export
  HTML, and Export CSV.
- Make the final three-action card sticky at the bottom of the viewport until it reaches its natural
  end-of-page position. Prefer CSS sticky positioning within the results content rather than scroll
  event handlers.
- Ensure neither sticky region covers focused controls, table content, pagination, alerts, or anchor
  headings. Add content padding/scroll margins where necessary.
- On narrow screens, allow controls to wrap and cap sticky-region height. If sticky controls would
  consume an unusable share of the viewport, fall back to normal document flow through a media
  query.
- Preserve natural placement at the page top/end and avoid visible jumps during loading or report
  renaming.

Update Results tests to verify route visibility, navigation placement, component class/structure,
and accessible names. Do not attempt to prove browser sticky geometry in jsdom; cover that with a
documented manual browser check.

## Phase 8 - Verification and delivery

Minimum automated coverage:

### Backend

- settings default/read/write round trip for `family_config_path`;
- family name/schema validation and CRUD/version conflicts;
- preservation of unavailable members during update;
- positive `ANY` and negative `ALL` Column Family predicate semantics;
- Value Family OR semantics and owner validation;
- effective expansion for comparing, identifier, and aggregation columns;
- legacy `grouping_columns` run loading and canonical `aggregation_columns` writes;
- legacy rules and rows/columns config loading;
- missing, partial, and zero-member family reference behavior;
- completed-run snapshots remain unchanged after a family edit.

### Frontend

- all renamed Aggregation Columns state, mapping, and UI paths;
- family management create/edit/delete and validation;
- unavailable members remain visible and are not dropped on edit;
- zero-member family disabled; partial family selectable with warning;
- loading a family unions columns into Column Filter;
- Add column family is inside Column filter;
- Upload-page rows/columns config loader preserves files and Column Filter;
- family choices in filters, rules, Comparing, Identifier, and Aggregation controls;
- context-sensitive Value Family availability;
- Add value family button placement beside filter/condition actions;
- rows/columns and rule config family-reference round trips;
- Results contents appear below primary navigation only on Page 3;
- sticky header/footer structures and narrow-screen fallback classes;
- Page 2 rule-list and run-action card separation.

Run and report:

```bash
uv run pytest -q
uv run ruff check backend tests
npm --prefix frontend test -- --run
npx --prefix frontend tsc --noEmit
npm --prefix frontend run build
```

Also perform a browser journey with two files that exercise a fully available family, a partially
available family, an unavailable family, positive and negative filters, a Value Family, saved config
reload, Results anchor navigation, and both sticky control regions. Record changed files, test
counts, compatibility behavior, and any deferred items in `reviews/`.

## Likely files and modules

The worker should confirm exact locations before editing. Expected areas include:

- `frontend/src/state/WorkflowContext.tsx`
- `frontend/src/api/domain.ts`, `wire.ts`, `mapping.ts`, `endpoints.ts`
- `frontend/src/components/AppShell.tsx`
- `frontend/src/pages/UploadPage.tsx`, `PreparePage.tsx`, `RulesPage.tsx`, `ResultsPage.tsx`,
  `SettingsPage.tsx`
- `frontend/src/features/upload/HeaderReview.tsx`
- `frontend/src/features/filters/*`, `features/targets/*`, `features/keys/*`, `features/rules/*`
- new `frontend/src/features/families/*`
- `frontend/src/features/results/TableOfContents.tsx`
- `frontend/src/features/settings/useSettings.ts`
- `frontend/src/index.css`, router and journey/component tests
- `backend/apps/settings/*`, project settings and `.config` loader
- `backend/apps/configs/*` or a new `backend/apps/families/*`
- `backend/apps/files/*`, `backend/apps/rules/*`, `backend/apps/runs/*`
- backend URL registration and test suites
- `frontend/dist/*`

## Definition of done

Round 2 is complete only when E2-E9 and every confirmed decision above are implemented, legacy runs
and configs load safely, all family references resolve consistently across authoring and execution,
automated checks pass, the production frontend bundle is refreshed, and the review document records
the browser verification outcome.
