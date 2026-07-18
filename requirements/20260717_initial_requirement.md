### Project Name
Project Name: Boat Control
Project Description: This project is targeting for a CSV file attribute calibration, which user uploads two versions of CSV file, and it compares different between two files and attribute changes. 
Also, it is serving the validation among attributes from records, to spot conflict, rule violating records.

### Project Component
1. UI interface for user to upload or read CSV files from a preset network location
   1. main page for user to upload, prefilter records before compare or validate
   2. compare and validate page to load rules from config file, by default checking all rule, allow user to deselect certains rules.
   3. result page:
      1. overall result: 
        - records load, 
        - row count of record violating rule, 
        - attribute count of records violating rule, 
        - row count of records have attribute changes, 
        - attribute count of records have attribute changes
      2. stats and details 
         - similar to overall results per rules 
         - details table of attribute count of records
      3. There is a floating table of content for user to quickly jump from details of different rules or the overall result.
   5. a rule configuration tab, which loads rule from config, user is allow to add new rule or remove existing rule
2. A simple config file to store user setting
3. A simple config file to store user defined validation rule
   - default config file sits in project root, allow user to config a remote file
4. preserve results for the last 10 runs, allow user to pick and load results from previous run.
5. allow user to export the current/loaded results into HTML report or CSV file.
6. A simple config file to store user's saved filters

### Technical Restriction
1. use React Framework, avoid stored XSS, DOM Injection, native JS prohibited
2. use django framework to construct the application
3. no reference of external resource during runtime. 
4. huge CSV file at around 120k rows, and 200 columns

### Processing logic
1. Upload stage: after user upload two file
   1. just read headers to check if headers for the two files have sharing columns; highlight and present if column difference.
   2. compare and validation happens only for columns in common (present in both files)
2. Pre-compare and validation stage:
   - filter section
      1. allow user to pick filter on columns(offer a searchable dropdown list of columns in common)
      2. user is allowed to add more filters on demand
      3. each row will only allow 1 filter
      - filter row should be: [type_searchable_dropdown]{column_name} [logical_dropdown]{logical_operator} [type_searchable_dropdown]{filer_value}
      - {column_name}: the list of headers of columns in common
      - {logical_operator}: equals to|not equal to|contains|not contains
      - {filter_value}: set of values from the selected {column_name} from both files, put a * mark to indicate if a value is present in one file only, user cannot pick value with * mark.
      4. user is allowed to select/deselect rule from the config, also user is allowed to add and save new rules.
      5. if user not provide any filters, ask to confirm run on full set, unless total row count from both files is less than 2000.
   - target section
      1. allow user to pick target columns for compare and validation(offer a searchable dropdown list of columns in common)
      2. allow user to directly input column name separated by comma, and provide a validate button to verify if input columns are in common
      3. if user not specify any columns, do compare on all columns
   - after user define all rules and filter, user clicks the run button
3. Result stage: 
   1. display the default report name, followed by a pencil icon: {file1}_vs_{file2}
   2. allow user to double-click on report name to edit and save the report name
   3. save the result automatically, if user edited report name, update corresponding file name accordingly
   4. save the report in JSON for easier loading later.
   5. each section, display the rule or comparison logic under the section title.
4. Rule configuration
   1. user is allowd to add, update and remove rules
   2. each rule should contain: name, logic definition and optional description, once saved, assign a auto-incremental unique rule index Rxxx
   3. logic definition should contain below sections:
      - condition section (optional)
        - row format: if [type_searchable_dropdown]{column_name} [logical_dropdown]{logical_operator} [type_searchable_dropdown]{filer_value}
        - each row will only allow 1 condition
        - user can input more than multiple condition, offer a plus button after the previous row
        - if user have more than 1 condition, user must pick from and|or to indicate relation between condition.
        - if user have 3 or more condition and user is not pick and|or consistently, display check box before rule, and user has to define grouping of conditions
      - logical section (mandatory), user got pick first format 1|2
        - row format 1(Value Against Column) : [type_searchable_dropdown]{column_name} [logical_dropdown]{logical_operator} [type_searchable_dropdown]{filer_value|Others}
          - if user picks others, provide an input box
        - row format 2(Column Against Column): [type_searchable_dropdown]{column_name} [logical_dropdown]{logical_operator} [type_searchable_dropdown]{column_name}