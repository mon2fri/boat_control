## Round 1
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
Carry over current content from 3. Validation rules page, which no longer needed 


## Round 2
--- Bug and Enhancement ---
B3. once continue to page compare and validate, user's selection was loaded into memory, but not correctly redisplay in the upload page. User should be able to come back and perform review on selection, or even make changes upon.
B4. Content/headers display style not aligned(example from page upload, but fix this for all pages)
    - "Upload & compare files", "Column preview" and "Key columns (record identity)" should in one style, as section header in the page
    - "Provide two CSV versions to calibrate. Choose from local upload or a configured remote source.", "5 shared columns. Comparison and validation run on shared columns only." and "5 shared columns. Comparison and validation run on shared columns only." are hints content goes below corresonding headers.
    - card headers
        - "Source", "First file (baseline)", and "Second file (candidate)" are card headers, these three should be in a row with 3 columns to preserve space.
        - Shared (x), Only in baseline.csv (x) and Only in candidate.csv (x) should follow style of other card headers
        - "Select columns to include" are in good style
        - "Columns Included (2)" and "Columns Excluded (3)" should follow style of other card headers
    - "Compare & validate", "Filters", "Target columns", and "Validation rules" are section header should follow the same style of those from previous page
    - "Filters" change into "Filtering Rows"; "Target columns" change into "Comparing Columns"
    - "Each row applies one condition. Rows are combined with logical AND. Leave the list empty to run against the full set." and "Choose the columns to compare and validate. If none are chosen, all common columns are used." are hint content should go under corresponding headers as those from previous page.
    - hint content should change according to use consistent expressions
    - Optimize the "Load saved filter" (change into "Load config for rows and columns") card
        - offer "load config", "save new config" and "remove selected config" buttons, when user click save new, prompt for config name
        - optimze layout, it is taking too much space on screen, make it a half wide card in the same row as header "Compare & validate"
    - card headers
        - "Load config for rows and columns"
        - "Column", "Operator", "Value" for multiple rows should remain within the same card
            - these three should align left or spread equals among screen
            - the hint text "Starred (*) values exist in only one file and cannot be chosen." can go immediately right next to "Value", but in hint content style
            - "Value" allow user to select multiple value from the column
            - "Column" should align with "Columns Included", currenlty show all columns from file even not selected in previous page.
        - "Add a target column" (change into "add columns to compare values")
            - should align with "Columns Included", currenlty show all columns from file even not selected in previous page
            - merge the two input boxes into one [searchable checkbox dropdown list], since their function align
        - "Select rules for this run" and "Edit Rxx" should be in the same row but in 2 columns taking 1/4 width and 3/4 width
            - the first column is always fixed to "Select rules for this run"
            - the second column can be displaying "Edit Rxxx" or "Add New Rule"
        - Within "Conditions"
            - "Combine conditions with" change into "Combining above conditions with": {AND|OR|PER GROUPING}
            - if selected `PER GROUPING`, display the `GROUPING` part.
            - remove the dropdown box next to "Combine with", within this part one condition|group can only be picked once, the behavior should be like below:
                1. offer buttons of "+ AND Group" and "+OR Group"
                2. user picks any one button --> display all available conditions --> user picks at least two from within --> create a new group
                3. user picks again any one button --> display remaining available conditions and groups --> user picks at least two from within --> create another group
                4. repeat step 3 untill all groups and conditions exhausted
                * keep the current dymanic condition grouping hint text for user to understand current logic.
        - Within "Logic": the layout should be the same as those from "Filtering Rows"
