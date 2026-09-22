Bug
B1. when user edits and saved a rule, either condition or logic changed, then replace the existing rule with user's new rule, instead of introducing a new rule
B2. the "save to config" button for the "validation rule" section is missing. 
B3. the "save to new config" button for the "validation rule" section doesn't preserve enable status. 
B4. When user created a duplicated rule, give user a hint that another equivalent rule exists, ask whether user needed the new one, if user sets different names and descriptions

B5. checkboxes status under "Extra Column" are not saved into `Config for rows and columns`, the `config for rows and columns` should capture all status from: `Row filters`, `Tracking Changing Columns`, `Extra Columns`, `Attribute Comparing Sectons`, as well as all config from page 1.Upload
E1. For Config loaded message, show the load result on top right corner on the page with a floating message box, which appears for 3 seconds after config loaded, and the fade out in 3 seconds.

- 20260922
- B6.the rule selection panel is not have correct behavior
  - current behavior: user can only see the first 10 rules even after navigating to the next page(page numbers changes, but content remains the same)
  - expected behavior: user can see the correct rules on each page, and the page number should be consistent with the content displayed
- B7. when loading some rule, get the error message "Rule X invalid: condition_relation is required when there are 2+ conditions."
  - However, when checking the mentioned rule, it has only 1 condition, and the `condition_relation` is not required. This is a bug.
  - On the error message, it should display the correct Rxxx, rule name as well as rule identifier for user reference. i.e. {rule_name}({Rxxx}, {rule_identifier}: {error_message})
- E2. In the rule editor card, currently the text `Rule identifier` goes below the Rxx, move it to the top right corner of the editor card, i.e. Rule Identifier: {rule_identifier}