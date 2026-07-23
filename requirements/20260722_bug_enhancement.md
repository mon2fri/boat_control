B1. in the upload page, the grouping column dropdown box is showing all columns instead columns selected in "COLUMN FILTER"
B2. in the result page, the grouping statistics is only showing Total and Null, however, I can see grouping columns are having different values from filter dropdown.

E1. optimize uploaded files, everytime user submit csv, after inspect header and while user is picking header, perform compare on uploaded files and stored files in /data/uploads
    - if same file,per content not filename, exists, don't have to upload, but pointing to the existing file, otherwise, upload and keep a copy of the file.
    - create a link between reports and underlying files, if no more report is pointing at the underlying files, remove those underlying files automatically.
    - at application start up, check if orphan underlying files without linked with any report, also remove the underlying files.


--- Round 2 ---
- E2. renaming all existing "Grouping Columns" into "Aggregation Columns"
- E3. Introduce two new components
    1. Column Family: it is a collection multiple columns that allow user to select all columns at once by selecting the column family
    2. Value Family: it is a collection multiple values that allow user to select all values at once by selecting the value family
    - Configuration:
      - after header inspection, user is allowed to load/edit new "Column/Value Familiy"
      - To add/edit Column family, user must define a Column Family Name(must start with letter, accepts letters, numbers, underscore), and select multiple columns to form a family
      - To add/edit Value family, user must define a Value family name(must start with letter, accepts letters, numbers, underscore), and select multiple values from the selected columns to form a family.
      - When user loads a previous saved Column family
        - if none of the column presents in both uploaded file, let user know if it invalid.
        - if only some of the columns present, let user know only columns within the family will be counted into later comparison and validation
      - When user picks a saved Value family
        - all values from that family should be treated as OR
        - value family is only available in value dropdown when the corresponding column/column family is selected from filter/condition
- E4. Column/Value family:
    - when configuring filters and conditions, if a column family is selected, the dropdown value should be set of all unique values from the column family
- E5. Entry point of Column/Value family
  - Common Entry: add a section of "Column/Value Family" in navigation bar, from within user can add/edit/remove Column/Value families
  - Column Family: in the upload page, offer a dropdown box to load Column Family in the same row of "Column preview", offer a button to "Add column family"
  - Value Family: in the compare and validate page, immediately right next to "+ Add filter" and "+ Add condition", offer a button to "Add value family"
- E6. in page 3, make the table of content within the navigation bar, but keep some spacing from navigation bar items.
- E7. in page 3, make the card of last 3 buttons floating and always park at the button of the page, unless user has scrolled to the very end.
- E8. in page 3, make the repot name, run time, and two export button floating and alway park at the top of the page, unless user is staying/scorlling back to the top of the page.
- E9. in page 2, wrap the rule list(from "Select rules for this run" to "+Add rule" button) in a card, the card holding "Run comparson and validation" should keep space with above cards.
