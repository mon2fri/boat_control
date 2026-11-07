This enhancement requirement is about adding exception tracking capabilities to our application. 
The goal is to keep tracking of exceptions from time to time and provides a better understanding of new exceptions, also to reduce noise from known exceptions.

## Requirements
1. Exception identification: each exception should be assigned with unified exception id across different runs.
   - Exception should be a concatenation of exception <exception_rule_identifier>_<key_columns>, if multiple key columns exists, concatenate them with underscore.
2. In the file loading page, add a date selector:"As-of Date" to indicate the exception tracking date. The default value should be the last weekday of the previous month. The date selector should be a calendar picker.
3. Exception data should be capture in a separate sqlite database file, the default location should be in project_root/data/exception_tracking.db. The database should create one table per "as_of_date", and tables with the following columns:
   - exception_id (text)
   - exception_rule_identifier (text)
   - key_columns (text)
   - exception_timestamp (datetime)
   - exception_commentary (long text)
   - exception_as_of_date (date)
   - exception_first_seen_as_of_date (date)
   - exception_last_seen_as_of_date (date)
   - exception_first_seen_timestamp (datetime)
   - exception_last_seen_timestamp (datetime)
4. The path of exception_tracking.db should be configurable via the setting tab. Acceptable path could be valid linux or windows path. User can input the absolute path, or using system provided path picker to select the path.
5. Each exception may have 3 status:
    - New: The exception is seen for the first time.
    - Commented: The exception has been commented by the user.
    - NotCommented: The exception has been seen before but has not been commented by the user.
6. Add a new tab in the application called "Exception Tracking" where users can view the list of exceptions, by picking a date from the "As-of Date" selector. The list should display the following columns:
   - Exception ID
   - Exception Rule Identifier
   - Key Columns
   - Exception Timestamp
   - Exception Commentary
   - Exception As-of Date
   - Exception First Seen As-of Date
   - Exception Last Seen As-of Date
7. The Exception Tracking tab should allow users to download exception list as commentary template for user to input.
8. The Exception Tracking tab should allow users to upload the commentary template(xlsx) back to the application, and update the exception commentary in the database accordingly. The uploaded commentary template(xlsx) should be validated to ensure that the exception IDs match the existing exceptions in the database.
9. In the result page, allow user to download the commentary template, which should be the same one that user can download from the Exception Tracking tab. For commented exceptions, the downloaded commentary template should be pre-filled with the existing exception commentary from the database.

## Enhancement

### Exception Tracking As-of Date selector

1. Replace the separate As-of Date and Recorded dates controls on the Exception Tracking tab with one As-of Date selector. This enhancement does not change the file-loading page date selector.
2. The first click opens a dropdown listing up to the 10 latest distinct available As-of Dates from the configured exception tracking database, ordered newest first. List only dates with recorded tracking data; do not fill unused positions with dates without data.
3. Add `Other date` as the final dropdown option, after the available dates. Keep it available even when fewer than 10 dates, or no dates, are available.
4. Clicking an available date selects it and loads its exceptions. Clicking `Other date` opens the calendar picker so users can navigate to and select other dates, including older available dates.
5. Within the calendar, visually mark or highlight every date with recorded tracking data, including dates older than the latest 10. Dates without data remain plain/normal. The data marker must be distinguishable from the selected-date and today indicators and understandable to keyboard and screen-reader users.
6. Preserve calendar date selection behavior: dates without data remain selectable and show the existing no-data state. Opening or dismissing the calendar without selecting a date must not change the current selection.
7. Refresh available dates and calendar markers when tracking data or the configured tracking database changes. Both controls must use the same authoritative available-date list.

Acceptance checks: verify descending order and the 10-date limit with more than 10 dates, fewer than 10 dates, an empty database, selection of an older marked date through Other date, plain unrecorded dates and their no-data state, calendar cancellation, keyboard interaction, and database switching.

### Commentary template exception details and table identity

1. Keep all current commentary-template columns, in their existing order, and append the exception-detail columns shown in the exception table. Include their corresponding values for each exception so users can review the context while entering commentary. Avoid duplicating columns already present in the template. Apply the same template layout and content to downloads from both Results and Exception Tracking.
2. In the exception table, use the stable Exception ID as the row identifier displayed to the user instead of the incremental index starting from 1. This applies to the exception-detail table, not only the Exception Tracking list. Preserve the remaining exception-detail columns. Use the same Exception ID in the table and its downloaded commentary template.
3. Appended exception-detail columns are informational only during commentary upload. Do not validate their contents against stored exception values or use them to update exception data or identify records. User edits or blank values in those columns must not prevent an otherwise valid commentary import.
4. Preserve existing validation of the template's required original columns, selected As-of Date and Exception IDs, including unknown/duplicate-ID rejection and atomic commentary updates. Continue to enforce file-format and resource limits; only the appended informational column contents are excluded from business-value validation.

Acceptance checks: verify matching Exception IDs between displayed exception rows and exported workbook; original template columns remain intact; appended detail headers/values match the displayed exception context; Results and Exception Tracking downloads agree; editing or clearing appended values still allows valid commentary updates; invalid Exception IDs or mismatched As-of Dates still fail without partial updates.

### Exception Tracking Template optimization
1. In the downloaded commentary template, keep exception related columns in below order:
   - Exception ID
   - Exception Status
   - Commentary
   - Rule Index
   - Other columns from the exception table, in their existing order, including the appended exception-detail columns.
   - For other columns from exception table, keep them hided by default in Excel table.
2. In the exception tracking tab, allow user to select which column to display, below is the default order of columns:
   - Exception ID
   - Exception Status
   - Commentary
   - Rule Index
   - Other columns from the exception table, in their existing order, including the appended exception-detail columns.
   - For other columns, hided by default
   - User should be able to select which column to display
   - The exception table should be paged and by default display 50 rows per page, but allow user to select 50, 100, 200, 500 rows per page. The table should be able to sort/filter by columns as other tables do.
3. In the second page, add a card for "Extra Columns for Commentary Template", located on the right of the "Attribute Comparing Section", and below the "Extra Column" card.
    - The card should allow user to select which columns to append in the Exception template download and display in the Exception Tracking tab.
    - Information from those columns should be stored in database as well for future retrieval.
    - If user require more columns in later as-of-date, exeption records from previous as-of-date should fill the new columns with empty values.
4. After user clicks "Run comparison and validation", the page should offer a checkbox "New Exceptions Only", checked by default.
    - If the box is checked, the result page, exported HTML report, exported Excel report, should only display new exceptions and previous exceptions, which without commentary, for the selected as-of-date, but the backend should still store all exceptions for the selected as-of-date in the database. However, the downloaded commentary template should still include all exceptions for the selected as-of-date, but the new exceptions/uncommented exceptions should be listed first in the template. For exceptions with commentary, the downloaded commentary template should pre-fill the existing commentary from the database.
    - If unchecked, all exceptions for the selected as-of-date should be displayed, and existing commentary should be pre-filled in the downloaded commentary template when available. The downloaded commentary template should still list new exceptions/uncommented exceptions first, followed by commented exceptions.

### Commentary template extra-column selection and configuration

1. Use the label `Extra Columns for Commentary Template` everywhere in the UI and documentation.
2. This setting is the sole source of appended source-data/detail columns in the downloaded commentary template and the corresponding additional columns in Exception Tracking. Do not automatically append columns from the existing Extra Column setting, Attribute Comparing Section, exception-detail table, or any other field/selection. If this setting is empty, append no source-data/detail columns. Preserve the standard exception-tracking metadata columns and their specified ordering/visibility; this restriction concerns additional data columns.
3. Append only the selected columns, in their configured order, using the persisted values for each exception. This supersedes earlier requirements to automatically append all exception-table/detail columns. Older records without values for subsequently selected columns remain empty as previously specified.
4. Save and restore `Extra Columns for Commentary Template` as part of `Config for rows and columns`, including the ordered selection. Loading an older configuration without this setting must initialize it to an empty selection rather than retaining stale values from the current session. Keep it independent of the existing Extra Column setting and other selections.

Acceptance checks: select different columns in Extra Column, Attribute Comparing Section and Extra Columns for Commentary Template; verify only the latter selection is appended. Verify an empty selection adds no data columns. Save the rows-and-columns configuration, change the selection, reload and verify the original ordered selection is restored. Load an older config without the field and verify the selection clears. Verify both download entry points and Exception Tracking use the same selected additional columns.


### Commentary workbook default column visibility

For downloaded commentary XLSX templates from both Results and Exception Tracking, hide only these six standard metadata columns by default: Exception Rule Identifier, Key Columns, Exception Timestamp, Exception As-of Date, Exception First Seen As-of Date, Exception Last Seen As-of Date. Keep Exception ID, Exception Status, Commentary and Rule Index visible. All appended columns selected in Extra Columns for Commentary Template must remain visible by default. This supersedes earlier workbook requirements to hide all columns after the first four; it does not change the Exception Tracking UI column chooser defaults. Preserve column ordering, values and import behavior.
