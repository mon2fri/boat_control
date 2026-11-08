# Round 1
## Bugs
1. In "Row filters" section, when selected "contains" in operator, the "value" should accepts free text, currently it is not accepting free text.
2. In the result page, the "overall result" section should also display the grouping of filters applied, currently it is displaying only the filters applied without grouping information.
3. Error message when downloading excel from the reslut page with `s35` and `outcome_groups` applied. Error message: Export failed: Cannot convert {'sa_flag': 'Yes', 'cva_flag': 'Yes'} to Excel
4. R079 has produced correct results in the result page, but when editing the rule, the outcome groups are not displayed correctly. The outcome groups should be displayed as "overall: group 1 OR group 2, etc. Currently only showing grup 1 and group 2, missing the overall Group 3: OR.

## Enhancements
1. The "Filter Groups" hints: "Filter 1: system contains "oomber" AND (Filter 2: status equals "active" OR Filter 3: status equals "inactive")", should use similar styple as that under "Outcome Groups" section: "overall: group 1 OR group 2\n
group 1: outcome 1 AND outcome 2\n
group 2: outcome 3 AND outcome 4"
2. Similar "OUTCOME X" and "CONDITION X", put "FILTER X" in the "Filter Groups" section, so that user is easily able to identify the filters.
3. For groupings, remove the button "Use all filter in an AND|OR group", instead, offer a button "Remove all groups", which will clear grouping information for the part(filter|condition|outcome).
4. Hide the hint text under "Row Filters", "Filter Groups", "Outcome Group" sections into exclaimation icons next to titles, which will show the hint text on hover, so that the UI looks clean.
5. Remove the "Use Single Outcome" button
6. as screenshot "Screenshot From 2026-11-08 21-20-43.png" shows, when group 1 and group 2 are forming the group 3, it is good that "Remove group" only shows for group 3, but it is better to show still the disabled "Remove group" for group 1 and group 2. When user hovers over the disabled "Remove group" button, show a tooltip: "This group is part of group 3, please remove group 3 first to remove this group."
