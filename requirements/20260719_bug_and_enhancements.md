#### Upload files 
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
Upload & compare files

|Source [dropdown for local upload|remote] | Baseline Version: [upload button] | Comparison Version: [upload button]|

-----------------------
Column Preview
| Shared (x) | Only in Baseline: {file name of baseline file} (x) |Only in Comparison: {file name of comparison file} (x)| 

Column Prefilter (To pick all related/needed columns for comparison and validation)
input box accepts comma separated input, when active, shows searchabout checkbox dropdown list of shared columns.

-----------------------
[continue button] [start over button]

