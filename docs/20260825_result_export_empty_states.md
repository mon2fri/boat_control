# Result and Export Empty-State Alignment

**Date:** 2026-08-25  
**Scope:** New Books aggregation display and empty Attribute Comparing sections.

## New Books aggregation

The New Books card now uses the same aggregation presentation as Overall Result:

- When nested aggregation is enabled, comparison-only books render in the nested tree.
- When nested aggregation is disabled, the card renders ordinary aggregation cards.
- New-book leaves retain their key-column detail table.

Persisted results use `comparison.new_book_details`, the public wire-format
field. `load_run()` migrates the short-lived legacy `new_book_rows` field when
encountered, so saved runs, the result page, and exports retain identified new
books.

## Empty Attribute Comparing sections

For a named Attribute Comparing section with no matching changes:

- The result page and rendered HTML export say `No books with {section name}`.
- The backend HTML export uses the same wording.
- The Excel **Attribute Comparing Sections** worksheet retains the table
  headers and adds `There is 0 record for this table.` as its sole data row.

The generic Attribute Changes section keeps its existing `No detail rows.`
empty state.

## Verification

- Frontend production build completed successfully.
- Result aggregation component tests passed.
- Backend report and persistence regression tests cover the new-book field and
  zero-record section output.
