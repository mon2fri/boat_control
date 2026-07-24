# 2026-07-24 Nested aggregation and comparison sections - worker instruction

## Objective

Implement nested aggregation for comparison results and make the Attribute Comparing configuration
support multiple user-defined comparison sections.

Preserve existing behavior for users who do not enable nested aggregation and for previously saved
configurations.

## 1. Nested aggregation

In the **Aggregation Columns** section, add a checkbox labeled **Enable nested aggregation**.

When nested aggregation is enabled:

- Allow the user to select multiple aggregation columns.
- Treat the selected columns as an ordered hierarchy.
- Apply the columns in the sequence shown in the UI.
- Allow the user to reorder the selected aggregation columns.
- Display the resulting aggregation as an expandable tree.

For example, when the configured order is **Status -> Region**, render a hierarchy equivalent to:

```text
Status
├── Active
│   ├── Region A
│   │   ├── Record 001 — 3 attributes changed
│   │   └── Record 002 — 1 attribute changed
│   └── Region B
└── Inactive
    └── Region A
```

### Tree behavior

- The first level groups records by the first configured aggregation column.
- Expanding a value shows groups for the next configured aggregation column.
- Continue this pattern for every selected aggregation column.
- The final aggregation level shows the unique records in that group.
- Each record shows the number of changed attributes for that record.
- Expanding a unique record shows every changed attribute in a table.

The expanded record table must contain:

| Column | Old | New |
| --- | --- | --- |
| Name of the changed column | Value from the baseline file | Value from the comparison file |

Represent null, empty-string, and missing values clearly and consistently with the application's
existing display conventions.

### Result-card scope

Apply the nested aggregation tree to:

- the **Overall Result** card; and
- all **Attribute Change** cards.

Do not change the current behavior or presentation of **Per-Rule Aggregation** cards.

When nested aggregation is disabled, retain the current aggregation behavior.

## 2. Configurable Attribute Comparing sections

Enhance the **Attribute Comparing** configuration so the user can:

- add a new comparison section;
- edit an existing comparison section;
- remove a comparison section where permitted by the existing workflow;
- define the display name of each section;
- select the set of columns compared within each section; and
- reorder sections if the existing configuration UI supports ordered items.

Display each configured comparison section under its user-defined name. A section's results must
include only the comparison columns assigned to that section.

### Validation

- A comparison-section name is required.
- At least one comparison column is required in each section.
- Handle duplicate section names consistently with the application's existing naming conventions.
- Do not silently discard a section or its selected columns.

## Persistence and compatibility

- Persist the nested-aggregation setting, ordered aggregation columns, section names, and each
  section's comparison columns through the application's existing persistence mechanism.
- Load and display saved values correctly when the user edits an existing configuration or opens a
  persisted result.
- Treat older configurations without the new fields as nested aggregation disabled and preserve
  their existing comparison behavior.
- Do not change unrelated comparison, filtering, rule, export, or result-card behavior.

## Required tests

Add or update automated tests covering:

- enabling and disabling nested aggregation;
- selecting and reordering multiple aggregation columns;
- hierarchy construction in the configured column order;
- expansion through every aggregation level;
- unique-record display at the leaf level;
- accurate changed-attribute counts per record;
- accurate **Column**, **Old**, and **New** values in an expanded record;
- distinct handling of null, empty-string, and missing values;
- nested trees on Overall Result and Attribute Change cards;
- unchanged Per-Rule Aggregation cards;
- fallback to the current behavior when nested aggregation is disabled;
- creating, editing, and removing comparison sections;
- section-name and selected-column validation;
- results being restricted to each section's configured columns;
- persistence and reload of all new configuration; and
- backward compatibility with configurations and results that predate these fields.

Run the relevant focused frontend and backend tests, the full practical regression suites, the
production frontend build, and `git diff --check`. Record any check that cannot be run and explain
why; do not report an unrun check as passing.

## Acceptance criteria

- Users can enable or disable nested aggregation.
- Users can configure multiple aggregation columns in an explicit order.
- Tree levels follow that configured order.
- The final aggregation level shows unique records and each record's changed-attribute count.
- Expanding a record shows accurate baseline and comparison values in a
  **Column / Old / New** table.
- Nested aggregation appears on Overall Result and Attribute Change cards only.
- Per-Rule Aggregation cards remain unchanged.
- Users can create and edit named Attribute Comparing sections.
- Each section compares and displays only its configured columns.
- All new configuration persists and reloads correctly.
- Existing single-level aggregation and saved configurations continue to work.

## Delivery

Document:

- the data-contract and persistence changes;
- the tree-building and record-counting approach;
- the UI components changed;
- automated test results;
- manual verification of expansion, ordering, and saved-configuration reload; and
- any unrelated pre-existing workspace changes intentionally left untouched.

