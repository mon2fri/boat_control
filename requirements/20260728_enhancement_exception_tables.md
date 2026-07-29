## Exception tables
In page 2, after the configuration of validataion rule, add a section to allow user config exception table columns

Exception Table will take All Key Column + Rule Index(Rxx) as identifier columns for it.
 - Exception table will include all aggregation columns
 - Exception table will allow user to pick extra columns to be included in the exception table.
 - For example: staff: lilly with id: 1 are excepted in R001 and R002, then lilly with id:1 should appear twice in the exception table, although all columns for lilly will be the same except the Rule No column.

Result delivery:
 - In the result page, append the Exception table after the last Rule result, collapsed by default, user can filter and sort in the table
 - In the exported HTML, append the execption table after the last rule result, collapsed by default, user can filter and sort in the table
 - In the exported Excel, add a new table for exception table.

Configuration persistent: exception columns should be into "config for rows and columns" as well.

Exception Table should be a sibling section as "Compare and Validate" and "Validation Rules", forms a 2 columns layout with config loader and saver on the right.
it contains one card: exception column

## Rule list:
 - Offer select all / deselect all 
- page the rule list for 10 rules per page.

## Other enhancement:
To remain visual consistence, "Attribute Comparing Sections" should in the same format as "Comparing Columns" and "Filtering Rows"