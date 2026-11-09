# Requirement snapshot for round 4 preparation

Captured from the user-edited requirement file on 2026-11-09; rounds 1–3 are context, round 4 is implementation scope.

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

# Round 2
## Enhancements
1. Update wording "Outcome X" into "Expectation X" within rule configuration section.
2. Update color for current RED "CONDITION" into Blue, with Corresponding background color.
3. "For Filter X: blar blar blar" under Filter Groups, make the "Filter X" part match the style in the above filter part, which is on the left of the column dropdown within "Row filter" section, so that it is easier for user to identify the filter. Apply this style matching for Condition X and Outcome X as well.
4. Optimize the layout of the "Row Filter" section, the layout in screenshot 1 is bad, the layout in screenshot 2 is expected. Make sure the label, column dropdown, operator dropdown, value input, ordering buttons, remove button are always in the same row and aligned properly. Make sure the "Add Filter" button is aligned with the "Row Filter" title.
5. The exclamation icon should be immediately next to the title, not on the right side of the page.

## Bugs
1. Round 1 Bug 3 still exist.

# Round 3
## Enhancements
1. In the result page, also the exported HTML report, make the tickbox of "New Exceptions Only" in the same style of "Overall result", and collaspe the hint text into an exclamation icon next to the title, which will show the hint text on hover, so that the UI looks cleaner.
2. For per rule tab in the exported Excel report, in the header section we have rule name, conditions, grouping, expectation, and rule identifier. Keep the rule name, then conditions: which should be a single cell but with multiple lines, each line is a condition(Condition 1: xxxx \n Condition 2: xxxx), then Condition Groupings(Group 1: Condition 1 AND Condition 2 \n Group 2: Condition 3 OR Condition 4), then Expectations(Expectation 1: xxxx \n Expectation 2: xxxx), then Expectation Groupings(Group 1: Expectation 1 AND Expectation 2 \n Group 2: Expectation 3 OR Expectation 4), then Rule Identifier.
3. In the result page/exported HTML report, make sure the per rule section are correctly order by rule index (Rxxx), as well as content table.
4. When clicking the "Add filter" within the "Row filter" card, the card should expand itself.
5. For "Track Changing Columns", "Extra Columns", "Attribute Comparing Sections", and "Extra Columns for Commentary Template", move their hint text into exclamation icon next to their right, with the same behavior as other exclamation icon.
6. update wording: "Filter grouping" --> "Combining Filters with"; "Combining above conditions with" --> "Combining Conditions with"
7. Check screenshots "Screenshot From 2026-11-08 23-08-28", "Screenshot From 2026-11-08 23-09-17", and "Screenshot From 2026-11-08 23-12-24". The text layer of "Filter Grouping", "Filter groups", "CREATE NEW GROUP", "GROUP TYPE", "Select Members", and "Conditions" are unclear, different layer should be distinguished by style/font sizes/colors. Remove the "Combine filters"
8. In Rule condition part, CONDITION X under "Conditions" are not showing the actual content as Expectation X or FILTER X does, should match label style and show the content of condition itself.
9. For Group X across "Row Filters", Conditions, and Expectation, apply a label style similar to Filter|Condition|Expectation, but in Green, When user picker from Existing Groups, they should see matching style labels of groups.


## Bugs
1. When configuring R079 on Expectations, after adding E1 & E2 --> G1, and E3 & E4 --> G2, it assumes G1 and G2 founds Group3, the behavior is incorrect, not grouping should be assumed.

# Round 4
## Enhancements
1. When user downloads commentary template from the report page, the commentary template should contain only exceptions from current run/enabled rules; However, when user downloads from the exception tracking tab, the commentary template should contain all know exception from the same as-of-date.
2. In the downloaded commentary template, the first tab, include a table for enabled rules, list rule conditions, condition grouping, expectations, and expectation groupings in column, follow the same format in the exported excel report.
3. In the exported result, if a rule captures not exception, put a hint: "Nil exception was captured by thie rule.", instead leaving an empty table.
