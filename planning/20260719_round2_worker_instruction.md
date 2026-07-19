# Round 2 worker instruction

Implement all Round 2 items in
[`requirements/20260719_bug_and_enhancements.md`](../requirements/20260719_bug_and_enhancements.md).

## Scope and constraints

- Work only on the Round 2 items.
- Do not modify the contents of any uploaded CSV file.
- Preserve all Round 1 behavior: local/remote source selection, Start Over
  cleanup, themes, identifier selection, and embedded validation rules.
- Preserve the existing API contract unless this instruction explicitly changes
  it. Cover every contract change with tests.
- Keep the application accessible and responsive.

## 1. Persist upload selections

Add `comparisonColumns: string[]` to `WorkflowState`.

- On successful upload, initialize it to all shared columns.
- `UploadPage` must read and write this state instead of storing comparison
  columns only in component-local state.
- Returning from Compare & validate to Upload must show the previous included
  and excluded columns plus identifier columns, and allow them to be changed.
- If a comparison column is removed, automatically remove it from `keyColumns`
  and `targetColumns`.
- Identifier columns must remain a non-empty subset of `comparisonColumns`
  before Continue is enabled.

### Uploaded-file behavior when returning to Upload

The existing server-side upload session remains valid while the user moves
between pages. Do **not** ask the user to upload the same files again just
because they return to Upload.

Native browser file inputs cannot be programmatically repopulated after a
component is remounted. Instead, show the current session filenames as loaded
files, for example:

- Baseline: `baseline.csv` — currently loaded
- Comparison: `candidate.csv` — currently loaded

Allow the user to review and change selections with those files. Provide a
clear **Replace files** action only when the user wants to start a new upload
session with different CSVs.

## 2. Propagate comparison columns

`header.common` remains the full raw shared-column list for preview and
server-side validation only.

Use `comparisonColumns` as the selectable and effective column set in:

- Filtering Rows
- Comparing Columns
- Identifier Columns
- Rule-condition and rule-logic selectors
- Column-value loading for filters
- Execution defaults: an empty target-column selection means all
  `comparisonColumns`, never all raw shared columns

Do not offer or retain an excluded comparison column in any downstream
control.

## 3. Filtering Rows: multiple values

The intended semantics are:

- Values selected within a single row are OR-ed.
- Separate rows are AND-ed.

Example:

```text
status in [active, pending] AND region in [APAC]
```

Update frontend state, backend filtering, wire schemas, saved-filter
persistence, and tests accordingly.

- Change the canonical filter model from `value: string` to `values: string[]`.
- Maintain backward compatibility when loading legacy saved configurations:
  convert `value: "active"` to `values: ["active"]`.
- The backend must implement membership / IN behavior; do not treat a
  comma-delimited string as one scalar value.
- Use a searchable checkbox multi-select for a row's Value control, based on
  the chosen filter column.
- Keep the starred-value note next to the Value heading in hint styling.
- Align Column, Operator, and Value as stable columns in each filter row.
- Rename **Filters** to **Filtering Rows** and place concise hint text directly
  beneath the section heading.

## 4. Comparing Columns

Rename **Target columns** to **Comparing Columns**.

- Replace the separate searchable picker and comma-separated input with one
  searchable checkbox multi-select.
- Limit choices to `comparisonColumns`.
- Rename the control to **Add columns to compare values**.
- Keep selected values visible and removable.
- An empty selection explicitly means all `comparisonColumns`.

## 5. Visual hierarchy and layout

Create reusable styling or components for:

- Page section heading
- Page hint text
- Card heading
- Card hint text
- Responsive card grids

Do not depend on global raw `h2` / `h3` styles to convey hierarchy. Apply the
new hierarchy consistently to Upload, HeaderReview, Prepare, Filtering Rows,
Comparing Columns, RulesPage, and RuleEditor.

The following must use the same section-heading style:

- Upload & compare files
- Column preview
- Key columns (record identity)
- Compare & validate
- Filtering Rows
- Comparing Columns
- Validation rules

Put each section's explanatory text directly below it using the common hint
style.

Required card layout:

- On Upload, Source, Baseline Version, and Comparison Version appear as three
  desktop columns and stack on narrow screens.
- Shared, Only in Baseline, and Only in Comparison use consistent card-heading
  styling.
- Columns Included and Columns Excluded use the same card-heading styling.
- Limit shared-column preview to approximately two visible rows with scroll for
  overflow.
- Use consistent wording and hint styling throughout both workflow pages.

## 6. Configuration controls

Replace the standalone saved-filter UI with one compact card titled:

**Load config for rows and columns**

It must provide:

- Config selector
- **Load config** button
- **Save new config** button that prompts for a name
- **Remove selected config** button with confirmation

Reuse existing config APIs/components where possible and do not display
duplicate saved-filter/config controls. Place the compact card in a half-width
desktop layout beside the Compare & validate summary area; stack it on mobile.

### Configuration scope

The configuration must save and load all of:

- Filtering Rows
- Comparing Columns
- Identifier/key columns

It must not replace uploaded files or Upload-page `comparisonColumns`. When
loading a configuration, discard configured target/key columns that are not in
the current `comparisonColumns` set and show a clear warning listing the
discarded columns.

## 7. Embedded validation-rules layout

Validation rules remain embedded in Compare & validate.

- Use a responsive two-column editor layout:
  - Left, fixed rule-selection panel: approximately 25% width.
  - Right editor panel: approximately 75% width.
- The right panel displays either **Edit Rxx** or **Add New Rule**.
- Keep rule selection usable when no editor is open.

## 8. Rule-condition grouping

Rename **Combine conditions with** to **Combining above conditions with**.

Offer top-level modes:

- AND
- OR
- PER GROUPING

For AND and OR, apply the selected join uniformly.

For PER GROUPING:

- Do not expose a per-group **Combine with** dropdown.
- Provide **+ AND Group** and **+ OR Group** buttons.
- When creating a group, show only remaining unused conditions and existing
  groups.
- A group requires at least two selected items.
- Conditions and groups may be used only once in the grouping tree.
- Repeat until no usable ungrouped items remain.
- Keep an understandable dynamic grouping-logic preview.
- Preserve valid existing grouping trees when loading existing rules.

Make Logic controls follow the same aligned field-row layout as Filtering
Rows.

## 9. Tests and verification

Add or update tests for:

- Upload → change comparison/identifier columns → Continue → return to Upload
  → selections remain visible and editable.
- Removing a comparison column removes invalid key/target selections.
- Downstream filter, target, and rule selectors exclude removed columns.
- OR semantics for values within one filter row and AND semantics across rows.
- Loading legacy saved filter configurations.
- Multiple-value filter save/load round trips.
- Empty Comparing Columns means all `comparisonColumns`.
- Config load/save/delete controls and discard warnings.
- Group creation: two-member minimum, no duplicate condition/group use, and
  correct resulting tree.
- Responsive layout classes and accessible labels where practical.

Run and report:

```bash
npm --prefix frontend test
npm --prefix frontend run build
uv run pytest <relevant backend test files> -q
```
