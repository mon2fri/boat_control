Enhancement on below items:
1. "Extra Columns in Exception Table": Change wording into "Extra Columns"
2. Allow checkbox for user to select where Extra columns will be displayed, user can check any combination of the following:
   - Overall Results
     - Result page
       - Append information to the table, which is displayed when user expands the tree view to the finest granularity, at which currently shows the changed attribute tables.
       - In other words, regardless whether extra columns have changes or not, the extra columns will be displayed in the table.
         - Target table structure:
         |Column|Old|New|
         |---|---|---|
         |Change 1|Old Value 1|New Value 1|
         |Change 2|Old Value 2|New Value 2|
         |Extra Column 1|Old Value 3|New Value 3|
         |Extra Column 2|Old Value 4|New Value 4|
     - Exported HTML Report: same pattern as result page
     - Exported Excel Report: put "Extra Columns" as extra columns to current changed attribute tables
       - Exported table structure
         |Column|Old|New|Extra Column 1(Latest)|Extra Column 2(Latest)|
         |---|---|---|---|---|
         |Change 1|Old Value 1|New Value 1|New Value 3|New Value 4|
         |Change 2|Old Value 2|New Value 2|New Value 3|New Value 4|
   - New Books
     - Result page
       - Append "Extra Columns" to the table, which is displayed when user expands the tree view to the finest granularity
       - Current table structure:
         |Key Column 1|Key Column 2|
         |---|---|
         |Value 1|Value 2|
       - New table structure:
         |Key Column 1|Key Column 2|Extra Column 1|Extra Column 2|
         |---|---|---|---|
         |Value 1|Value 2|Value 3|Value 4|
     - Exported HTML Report: same pattern as result page
     - Exported Excel Report: put "Extra Columns" as extra columns to current new books tables
       - Exported table structure
         |Key Column 1|Key Column 2|Extra Column 1|Extra Column 2|
         |---|---|---|---|
         |Value 1|Value 2|Value 3|Value 4|
   - Exception tables: keep current behavior, no change needed