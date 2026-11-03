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