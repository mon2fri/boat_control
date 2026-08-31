# Extra Columns Display and Configuration

**Date:** 2026-08-31  
**Scope:** configurable extra columns in results and exports.

## Configuration

The **Extra Columns** card on Compare & validate selects columns from the
comparison file. Its ordered selection is stored in a rows-and-columns
configuration under `extraColumns`. The configuration also stores the three
display choices in `extraColumnDisplay`.

Older saved configurations using `exceptionColumns` remain loadable. New
saved configurations use `extraColumns`.

Use the up and down controls beside a selected column to set the display and
export order.

## Display choices

Each checkbox applies to all three delivery formats at once:

- **Overall Results**: result page, exported HTML, and the Excel Attribute
  Changes worksheet.
- **New Books**: result page, exported HTML, and the Excel New Books
  worksheet.
- **Exception Tables**: result page, exported HTML, and the Excel Exception
  Table worksheet.

## Latest values

Extra-column values are taken from the comparison file, so they are the
latest values. In Overall Results, and in the Excel Attribute Changes
worksheet, their headers are shown as `Column Name(Latest Value)`.

## Compatibility

Existing runs and configurations default to retaining exception-table extra
columns. Display settings are persisted with each run so reloading a saved run
uses the same result and export behavior.

