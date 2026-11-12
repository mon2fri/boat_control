# Rule editing and grouping previews

Implemented on `work/20261108-grouped-validation` on 11 November 2026.
The UI changes are included in commits `13a19c9` and `a2c7328`.

Planned rule revision history and cross-version commentary behavior are specified
separately in [Rule revisions and commentary recertification](../requirements/20261112_rule_revision_and_commentary_recertification.md).

## Rule list and editor

The validation rule list now fills the available width. The reserved editor
column has been removed, and each row displays the rule description instead
of its logic expression. Rules without a description show `No description`.

- **Add rule** opens an empty editor overlay.
- **Edit** opens the selected rule in the overlay.
- **Copy** opens a new-rule draft with the source conditions, expectations,
  both grouping trees, extra columns, and comparison-display setting retained.
  The name and description start blank. Editing this draft does not modify the
  source rule.
- **Save rule** closes the overlay after a successful save. Validation or
  server errors leave the draft open for correction.
- **Cancel** discards the draft and closes the overlay immediately.
- Clicking the backdrop or pressing Escape does not close the editor.

The overlay scrolls independently, keeps keyboard focus within the editor,
and restores focus when it closes. This behavior applies to both the embedded
validation panel and the standalone rules page.

Copy uses the existing create-rule API and canonical identity rules. Saving
unchanged executable logic can reuse an equivalent existing rule; entering a
different name or description alone does not create a new logical identity.
The page reports when an equivalent rule is reused.

## Eye-icon previews

An eye icon appears immediately before each rule checkbox. Hover over the icon
to see a read-only tree with **Conditions on the left** and **Expectations on
the right**. Moving onto the preview keeps it open; moving away dismisses it
after a short delay. Keyboard focus also opens the preview, and Escape closes
the preview without opening or changing a rule.

The same preview is available beside each rule heading on the results page.
The eye beside **Overall result** shows the applied filter tree. On narrow
screens, the two rule sections stack vertically.

Labels use the same styling as the grouping editors:

| Label | Color |
| --- | --- |
| Filter X | Blue |
| Condition X | Blue |
| Expectation X | Blue |
| Group X | Green |

Groups display their AND/OR operator and retain the saved nested structure.
Group numbers are assigned from the deepest groups upwards, separately for
each tree. Previews do not change rule selection or saved definitions.

## Results presentation

The Overall result card shows its heading followed by the five headline counts.
`Books after filters` appears as a normal, subdued text line rather than a sixth
number card.

Filter clauses and their parenthesized expression are no longer displayed
inline in the Overall result card. They remain accessible through its eye icon.
The no-filter message and invalid-grouping warnings remain visible when relevant.

Rule sections retain their descriptions, exception counts, and detail tables.
The inline condition, grouping, and expectation expressions have moved into
the hover preview.

## Historical accuracy

Result previews use the run's persisted metadata, independently of subsequent
catalog edits. They do not fetch today's rule definition to describe a past run.

New runs save `condition_tree` and `expectation_tree` alongside their existing
numbered clause descriptions and grouping summaries. The frontend retains these
fields when parsing both current and legacy run documents.

Older runs with numbered `Overall`/`Group X` hierarchy metadata can reconstruct
their original tree. If that metadata is missing, ambiguous, cyclic, or references
removed clauses, the preview shows the available original text and an explicit
warning rather than inventing a replacement grouping. Missing historical
condition metadata is distinguished from an explicitly unconditional rule.

## Standalone HTML exports

The **Export HTML** action includes the same eyes and colored trees. Reports
work offline without React, a running backend, or external assets.

Each eye contains its own saved preview data once. One shared script renders
all previews into a single reusable floating panel on hover or focus. It uses
text nodes for rule names, descriptions, and values rather than interpreting
them as HTML. Exporting does not require opening each preview first.

In a measured example containing one four-expectation rule and one overall
filter preview, the additional shared script was **5,307 bytes**, and the two
preview payloads totaled **1,211 bytes** before HTML attribute escaping.
Actual overhead depends on clause text and grouping complexity. Data is stored
per rule/overall heading, not repeated for every exception record.

## Related commentary-template updates

- Results-page downloads use `<report_name>_commentary_template.xlsx`, with
  filename-safe characters.
- The Template tab includes **Report Name** directly after **Instructions**.
- The Enabled Rules table includes a **Description** column and is separated
  from the metadata by an empty row.
- Existing template version/date positions and exception-sheet import identity
  remain unchanged.

The root `baseline.csv` and `candidate.csv` samples include `sa_flag`, `cva_flag`,
and `system`, matching the saved UI flag configurations. After replacing sample
files, upload both again, select the needed comparison columns, and reload the
configuration so stale unresolved filter references are rebuilt.

Docker build and Windows Compose instructions are in
[`docker/README.md`](../docker/README.md).

## Verification

- Frontend production build and TypeScript checks passed.
- Frontend tests cover overlay lifecycle, copy preservation, hover dismissal,
  label badges, historical grouping restoration, result mapping, and export
  data/script generation. The workflow test also checks the subdued book count.
- 212 backend tests passed using isolated grouped-validation settings, covering
  run execution, grouping, persistence, capture, and commentary rule tables.
- An actual exported report was opened through `file://` in Chrome. Checks
  confirmed overall/rule hover behavior, nested AND/OR groups, side-by-side
  columns, dismissal, and a single shared panel.

To rebuild browser assets from the repository root:

```bash
npm --prefix frontend run build
```

Useful focused frontend checks:

```bash
cd frontend
npm test -- src/features/rules/RuleGroupingPreview.test.tsx src/features/results/ResultGroupingPreview.test.tsx src/features/reports/groupingPreviewScript.test.ts src/features/reports/exportRenderedHtml.test.tsx
```

Key implementation files:

- `frontend/src/pages/RulesPage.tsx`: editor lifecycle and create/edit/copy actions.
- `frontend/src/features/rules/RuleEditorOverlay.tsx`: modal editor container.
- `frontend/src/features/rules/RuleGroupingPreview.tsx`: shared live hover renderer.
- `frontend/src/features/rules/ClauseLabel.tsx`: shared numbered badges.
- `frontend/src/features/results/ResultGroupingPreview.tsx`: saved rule/filter adapters.
- `frontend/src/features/reports/groupingPreviewScript.ts`: offline hover renderer.
- `backend/apps/runs/services.py`: run-time snapshot of the grouping trees.
