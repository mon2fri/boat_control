# 2026-07-24 Overall nested-tree correctness and rows/columns config persistence - worker instruction

## Objective

Fix the Overall Result nested tree so it lists only genuine baseline-to-comparison attribute
changes, and verify that Rows and Columns configurations persist and restore the complete nested
aggregation and Attribute Comparing setup.

Use this screenshot as the defect reference:

- [`Screenshot From 2026-07-24 21-14-37.png`](../screenshots/Screenshot%20From%202026-07-24%2021-14-37.png)

## 1. Exclude rule violations and unchanged values from the Overall change tree

### Confirmed defect

The screenshot shows unchanged values presented as changed attributes:

- `name: Iris -> Iris`
- `score: 81 -> 81`
- `name: Carol -> Carol`
- `name: Sam -> Sam`
- `score: 82 -> 82`

The Overall nested tree currently combines:

```typescript
result.changeDetails
result.ruleResults.flatMap((rule) => rule.details)
```

`NestedAggregationPanel` treats every supplied detail as a changed attribute. Rule-exception rows
represent validation failures, not baseline-to-comparison changes, and can therefore display equal
Old and New values while being counted and labeled as changed attributes.

### Required behavior

- The Overall nested tree must contain only genuine attribute-change rows.
- Use `result.changeDetails` as its source.
- Do not include `ruleResults[].details` in the Overall change tree.
- A record with one actual attribute change and two rule violations must display
  `1 attribute changed`.
- A record with rule violations but no actual attribute changes must not appear in the change tree.
- The expanded **Column / Old / New** table must list only actual changed attributes.
- Do not change Overall summary-card counts.
- Do not change validation-rule summaries or Per-Rule cards.
- Do not remove rule violations from their existing rule-specific displays or exports.

Do not fix this only by checking `file1Value !== file2Value`. A rule exception can contain two
different displayed values while still not representing a baseline-to-comparison attribute change.
Use the semantic row kind (`kind === "changed"`) or the canonical `changeDetails` collection.

Apply both:

1. Pass only `result.changeDetails` to the Overall `NestedAggregationPanel`.
2. Add a defensive filter in the tree-building boundary so `kind: "exception"` rows cannot be
   counted as changed attributes if a future caller accidentally supplies them.

### Required tests

Add tests covering:

- Overall tree excludes all `kind: "exception"` rows.
- Equal Old/New rule-exception values are not rendered in the change table.
- Rule exceptions with different displayed values are also excluded.
- One real change plus multiple violations produces a change count of exactly one.
- A violation-only record is absent from the Overall change tree.
- Multiple actual changes for one record are still counted accurately.
- Attribute Change cards continue to show their configured actual changes.
- Per-Rule cards continue to show validation exceptions unchanged.
- Overall summary counts and rule counts are unaffected.

## 2. Persist the complete Rows and Columns configuration

### Configuration values that must be saved

When the user selects **Save new config** or **Save to config** for Rows and Columns, persist:

- selected comparison columns;
- key columns;
- aggregation columns in their exact configured sequence;
- whether **Enable nested aggregation** is checked;
- filters;
- comparing/target columns;
- every Attribute Comparing section;
- each section's stable ID where the current schema uses one;
- each section's user-defined display name;
- each section's selected comparison columns; and
- the exact order of Attribute Comparing sections.

Aggregation column order is semantic. For example:

```text
["status", "region"]
```

must reload as **Status -> Region**, not **Region -> Status** and not an unordered/sorted set.

Attribute Comparing configuration example:

```json
[
  {
    "id": "identity",
    "name": "Identity changes",
    "columns": ["name", "owner"]
  },
  {
    "id": "financial",
    "name": "Financial changes",
    "columns": ["score", "limit"]
  }
]
```

The section order, names, and column order must survive save and load.

### Load and replacement behavior

Loading a Rows and Columns configuration must replace the current values for every field above,
including false and empty values.

Required examples:

- A saved `nestedAggregationEnabled: false` must turn off a currently enabled checkbox.
- Saved empty aggregation columns must clear the current aggregation selection.
- Saved empty Attribute Comparing sections must clear the current sections.
- Saved section names and columns must replace, not append to, current sections.
- Saved aggregation order must replace the current order exactly.
- Legacy configurations without the new fields must load as:
  - nested aggregation disabled; and
  - no custom Attribute Comparing sections.

Do not condition dispatches on arrays being non-empty or flags being true. Empty and false values
are meaningful replacement values.

### Schema and mapping requirements

Verify the full path:

```text
Workflow state
  -> mapWorkflowToRowsColumnsConfig
  -> configuration create/update request
  -> stored YAML/JSON content
  -> configuration detail response
  -> resolveRowsColumnsConfig
  -> workflow reducer dispatches
  -> rendered controls
```

Ensure:

- ordered arrays are never converted into sets, records, or sorted lists;
- family references resolve without changing the relative order of explicitly selected columns;
- duplicate resolved columns are handled deterministically without reordering unrelated columns;
- invalid/missing section columns generate existing-style warnings rather than silently corrupting
  the remaining configuration; and
- a valid section is not discarded merely because another section contains an invalid column.

### Required persistence tests

Add a full round-trip test using a non-default configuration containing:

- nested aggregation enabled;
- aggregation columns ordered as `["status", "region", "owner"]`;
- at least two named Attribute Comparing sections;
- multiple columns in each section;
- an explicit non-alphabetical section order; and
- the existing key, comparison, filter, and target-column fields.

Assert after save and reload:

- nested aggregation remains enabled;
- aggregation columns retain the exact sequence;
- section count is unchanged;
- section IDs, names, order, and selected columns match exactly;
- existing fields also remain unchanged; and
- the rendered checkbox, ordered aggregation controls, and section editor reflect the restored
  values.

Also test:

- `nestedAggregationEnabled: false` clears a current true value;
- empty aggregation columns clear a current non-empty selection;
- empty sections clear current sections;
- legacy configuration defaults;
- Save to config followed by reload uses the updated values and version;
- names and IDs containing supported characters survive round-trip; and
- removing a comparison column prunes it from saved aggregation and section selections according to
  the existing reducer rules.

Test both configuration operations:

- **Save new config**
- **Save to config**

A mapper-only unit test is insufficient. Include at least one ConfigManager/API persistence
round-trip or component integration test that exercises the actual save and load flow.

## 3. Replace aggregation-column arrows with drag-and-drop ordering

### Required interaction

When nested aggregation is enabled, replace the current large up/down arrow buttons beside selected
aggregation columns with a compact drag-and-drop list.

Requirements:

- Each selected aggregation column is one draggable row.
- Provide a compact drag handle with an accessible label such as
  `Drag to reorder Status`.
- Dragging a row shows a clear lifted/active state.
- Show an insertion indicator at the prospective drop location.
- Support moving an item to the beginning, middle, and end of the list.
- Update `aggregationColumns` immediately after a valid drop.
- The visible numbering must update to match the new hierarchy.
- The first displayed column remains the first tree level.
- Do not show the existing large ▲ and ▼ buttons in the normal UI.
- Removing a column must continue to work independently of dragging.
- Clicking the remove control must not initiate a drag.
- A click without meaningful pointer movement must not reorder the list.
- Cancelling a drag must preserve the original order.
- Prevent duplicate column entries after repeated drags.

Use the project's existing dependencies if a suitable maintained drag-and-drop library is already
installed. Do not add a new runtime dependency without checking whether native pointer/drag support
or an existing dependency is sufficient.

### Accessibility

Drag-and-drop must not be pointer-only.

Provide a keyboard interaction on the drag handle using an established accessible sortable pattern:

- focus the drag handle;
- press Space or Enter to pick up the item;
- use Arrow Up and Arrow Down to choose its new position;
- press Space or Enter to drop;
- press Escape to cancel.

Announce pickup, movement, drop, and cancellation through an `aria-live` region. Announcements
should identify the column and its position, for example:

```text
Picked up Region, position 2 of 3.
Moved Region to position 1 of 3.
Dropped Region at position 1 of 3.
```

Also ensure:

- the handle has a visible keyboard focus indicator;
- drag state is not communicated by color alone;
- touch targets are large enough to operate reliably;
- screen-reader labels do not rely on visual arrow glyphs; and
- the list remains usable at narrow viewport widths.

Do not retain visually hidden arrow buttons as the primary keyboard mechanism unless the selected
drag-and-drop pattern requires them internally. The intended visible UI is a compact drag handle,
column label, hierarchy position, and remove control.

### Persistence

The dropped order must update the canonical `aggregationColumns` array. Saving the Rows and Columns
configuration immediately after a drag must persist that exact order. Loading it must reproduce the
same order in:

- the draggable list;
- hierarchy numbering; and
- the nested result tree.

### Required drag-and-drop tests

Add component tests covering:

- the drag handles render while nested aggregation is enabled;
- the old visible ▲ and ▼ buttons are absent;
- pointer drag moves the last column to the first position;
- pointer drag moves the first column to the last position;
- keyboard pickup, movement, and drop reorder columns;
- Escape cancels keyboard dragging;
- remove still removes the intended column without reordering;
- dropping outside a valid target preserves the original order;
- repeated reorder operations do not create duplicates;
- live-region announcements describe positions accurately; and
- saving and reloading after a drag preserves the resulting sequence.

Use the drag-and-drop library's recommended testing utilities where applicable. Do not assert only
that draggable attributes exist; exercise the actual reorder callback and resulting array.

## Scope and safety

- Preserve completed rule-config replacement and config-removal fixes.
- Preserve Per-Rule Aggregation behavior.
- Preserve existing exports and summary calculations.
- Do not change validation-rule semantics to hide the Overall-tree defect.
- Work with the existing dirty tree and do not revert unrelated user or worker changes.
- Do not overwrite runtime rule/config files to make tests pass.
- Use isolated temporary configuration directories in backend tests.
- Refresh `frontend/dist` only after source tests and the production build pass.

## Required verification

Run:

```bash
npm --prefix frontend test -- --run
npm --prefix frontend run build
uv run pytest -q tests/backend tests/contracts tests/integration
git diff --check
```

Manually verify:

- the screenshot's unchanged values no longer appear under Overall Result;
- the real `status: active -> inactive` change still appears;
- change counts match actual changed attributes;
- aggregation columns can be reordered by pointer and touch drag;
- aggregation columns can be reordered using only the keyboard;
- the large arrow controls are no longer displayed;
- drag order immediately changes the nested hierarchy order;
- saving and reloading preserves nested aggregation and its ordered columns;
- saving and reloading preserves Attribute Comparing section names, order, and columns;
- loading a configuration containing false/empty values clears current settings; and
- Per-Rule cards still display their validation exceptions.

## Delivery documentation

Update the active delivery/follow-up documents with:

- the confirmed root cause of unchanged values in the Overall tree;
- the corrected tree data source and defensive filtering rule;
- the complete Rows and Columns config schema;
- evidence that aggregation and section ordering survive persistence;
- focused and complete test results;
- manual before/after verification against the screenshot;
- refreshed bundle asset names; and
- unrelated dirty files intentionally left untouched.

## Acceptance criteria

- Overall nested aggregation lists only actual changed attributes.
- Rule violations are never labeled or counted as changed attributes in that tree.
- Unchanged Old/New pairs from the screenshot are absent.
- Real changes and their counts remain accurate.
- Rows and Columns configs save the nested-aggregation flag.
- Selected aggregation columns use compact, accessible drag-and-drop ordering instead of visible
  arrow buttons.
- Pointer, touch, and keyboard users can reorder the columns.
- Aggregation columns persist and reload in their exact sequence.
- Attribute Comparing section IDs, names, ordering, and column selections persist and reload.
- Loading false or empty saved settings clears current values.
- Legacy configurations remain supported.
- Save new and Save to config both round-trip correctly.
- Per-Rule cards and rule validation remain unchanged.
- All required tests and builds pass.
