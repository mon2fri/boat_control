1. In the upload page, add another card, in the same row as KEY COLUMNS, called: Grouping Columns.
   - the checkbox dropdown list should have the same behavior as that from KEY COLUMNS
2. In compare and validate page, Filtering Rows, and conditions for validation rules, should be filtering on columns from the COMPARISON file, instead of both files.
3. In page 2, when loading data, show the reminder text in red
4. In page 2, in the add/edit rule card, format the text in below:
    ```
   A rule describes the [Green, bold]{required/expected state} for one column(and optionally a set of preconditions).\n
   [bold]{Rows} that [Green]{match} the rule are [Green]{valid}; \n
   [bold]{Rows} that [Red]{DO NOT match} are reported as [Red]{exceptions}. \n
   Example: [Greybox]{status must equal to "active"} flags every row whose status is anything other than [Greybox]{active}.\n
   \n
   [bold]{Conditions} narrow the rows the rule applies to (e.g. only check [Greybox]{status] when [Greybox]{region} is [Greybox]{HBAP};\n
   [bold]{Logic} clause is the actual required state.
   ```
5. In the logic part
   - When user picks "Value against column", the value provide a checkbox dropdown, use can pick from values, or input their own value, separated by comma. If multiple values provided, values should be in OR.
   - When user picks "Column against column", "COLUMN" change into "COLUMN in COMPARISON", "COMPARED COLUMN" change into "BASELINE COMLUMN"
6. In result page, for all details tables, allow user to filter on key columns and or "COLUMN"
7. In the result page, at the button of the overall result card, state the filters on row.
8. In the result page, show statistics per column from grouping columns(if defined).
    - For example: if region is one of the grouping columns, and region contains east, west, south, north
    - the group statistics for region should be in a table, showing exception count for each region per key columns
      |region|Unique Count|Attribute Count|
      |---|---|---|
      |Total|10|25|
      |east|3|5|
      |west|2|8|
      |north|1|8|
      |south|4|4|
9. Group statistics available to overall result, attribute changes(if defined), and per validation rules
10. Group statistics is expandable, but collaspes by default, when it is collapsed, show the unique count and attribute count of the group. When expanded, show the table.
11. Grouping should be evenly distributed across the display area, which the corresponding card, with no more than 4 groups in a row, but try to distribute groups evenly across rows and columns (e.g. if 5 grouping columns, put 3 groups in first row and 2 in second row, instead of jamming 4 into first row and leaving 1 into the second row) 
12. Logic and appearance for other component should remain the same as-is, do not make unnecessary change/fix without my approval.
