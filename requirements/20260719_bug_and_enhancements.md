#### Upload files (rename to 1. Upload) 
--- Bug ---

B1. In the upload page source only shows "local upload", without seeing remote option
B2. The filter columns cannot input multiple columns, it should accepts comma separated input, but not conflict with those from enhancement

--- Enhancement ---

E1. Add light / dark themes
E2. In the header review section, the filter columns, make it a searchable dropdown list with checkbox
  - users can search and also select multipe items;
  - by default checks all items, but allow user to deselect or or select all or user picks only wanted item
E3. Put the Shared/Only in baseline/Only in candiate above the filter column input box
  - for shared, list maximuin 2 rows of columns, but not all.
E4. base on E2 and E4, add another two cards: Columns Included and Columns Excluded
  - the column tags under Columns Included card should use green notation; while tags under Columns Excluded should use red notation
E5. Within the same card of Continue to filters & targets, add a button: Start Over, which clears all uploads and current selection

--- Layout Component ---

-----------------------
Upload & Precheck Files

|Source [dropdown for local upload|remote] | Baseline Version: [upload button] | Comparison Version: [upload button]|

-----------------------
Column Preview
| Shared (x) | Only in Baseline: {file name of baseline file} (x) |Only in Comparison: {file name of comparison file} (x)| 

Column Filter (To pick ALL related/needed columns for comparison and validation)
input box accepts comma separated input, when active, shows searchabout checkbox dropdown list of shared columns.

-----------------------
Identifier Columns (Record Identity)
input box accepts comma separated input, when active, shows searchabout checkbox dropdown list of columns selected in filter.
this input box is mandatory for at least one columns, othewise continue button is disabled.

-----------------------
[continue button] [start over button]

#### Filters & targets (rename to 2. compare and validate)

-----------------------
Row filters, same line offer the dropdown list of saved filters and columns) with load button and a saved current filters and columns.

Current Filters section

-----------------------
Comparing columns
Current Target Columns section, KEY COLUMNS is implemented in previous page, no longer needed here.

-----------------------
Validation rules
Carry over current content from 3. Validation rules page, which not longer needed 
