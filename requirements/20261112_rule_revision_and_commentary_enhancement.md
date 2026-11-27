## Round 1
### Bugs
1. from the preview db: /tmp/boat-control-rule-evolution-preview-20261112-195416/data/exception_tracking.db
The same rule ran for two as-of dates: Oct 31, and Nov 1. Commentary uploaded into Oct 31, but the same exception is showing up from Nov 1 when "New exception" is checked.
check report_nov1.html from reference directory
Expecting: the two commented exception doesn't show up in Nov 1 run.

## Round 2
### Enhancements
1. don't need to show below columns from the downloaded commentary template: Recertification Reason, Carried From Exception ID, Carried From As-of Date, Carried From Rule Identifier, Rule Evolution Event ID, Recertified At
When recertificate required, show it in "Exception Status".
2. In the result page/exported HTML, just show a purple R icon next to exception id, dont break current layout
3. In the result page/exported HTML, within the per rule table, move the exception identifier column to the most right, and the first column use a index starting from 1 per rule. The index servce not identification, but just a sequence per run per rule
4. Add a column named exactly "Commentary Recertify" to commentary templates
downloaded from either the result page or exception tracking page. Default blank;
the Excel dropdown allows "Keep Current" or "Updated".

Before applying commentary upload rules, trim leading/trailing whitespace from
commentary input. Whitespace-only input is empty. Preserve internal whitespace
and line breaks. This normalization applies to commentary only; do not trim or
rewrite exception IDs, rule identifiers, or book keys.

The following decision table applies only to exceptions requiring recertification
according to the current database state at upload time:

| Commentary Recertify | Action on upload |
| --- | --- |
| Keep Current | Read the current commentary from the database and ignore the spreadsheet commentary. If the database text is nonempty, retain it, mark Commented, and clear pending recertification. If it is empty, mark Not Commented and clear pending recertification. |
| Updated, Commentary empty | Remove the current database commentary, mark Not Commented, and clear pending recertification. |
| Updated, Commentary nonempty | Store the user-supplied commentary, mark Commented, and clear pending recertification. This also applies when the supplied text equals the database text. |
| Blank | Preserve the current database commentary and status. Spreadsheet commentary changes alone do not update or recertify this row. |

An exception with empty database commentary must not require recertification;
it is Not Commented. This also applies across rule revisions: an existing
uncommented exception remains Not Commented under the new exception ID rather
than becoming New or requiring recertification. Genuinely first-time exceptions
without predecessor occurrences retain the normal New behavior.

For an already Commented exception that does not currently require recertification:

| Uploaded Commentary after trimming | Action on upload |
| --- | --- |
| Nonempty | Accept the supplied commentary as the new database value by default and retain Commented status. No recertification selection is required. |
| Empty, including whitespace-only | Ignore the empty input, preserve current database commentary, and retain Commented status. Do not clear an accepted comment through a blank ordinary upload. |

These rules also apply to stale templates. For an already Commented exception,
accept the nonempty submitted text even if the database commentary changed after
the template was downloaded; empty input preserves the latest database value.
For a currently pending row, apply the recertification table above. Keep Current
always reads the current database value, not the text originally exported.

The deliberate clearing action remains Updated + empty for a pending
recertification row. It must not be confused with an ordinary Commented row's
empty input, which preserves its accepted text. Other nonpending New/Not
Commented rows retain their existing upload behavior unless specified separately.

Validate Commentary Recertify on the backend before any database writes, even
when a spreadsheet bypasses Excel's dropdown validation. Only Blank, Keep
Current, and Updated are valid. Reject other values with a clear row-specific
validation error; the upload is atomic, so no rows are partially updated. A
valid dropdown value on a nonpending row does not override the ordinary upload
rules, because recertification actions apply only to pending rows.

Keep database provenance and audit history even when its columns are removed
from the downloaded template.

### Bugs
1. In Nov 1 run: exception CBR1_0W8RRC1KFR747SSFA4QG_23_Wendy was "Not Commented", in Nov 2 run, the original rule was updated, the same exception, but with new exception id: 	CBR1_1QECTTZ5EDRVM6W18H1Z_23_Wendy was tagged as "New", it should have carried "Not commented".
2. In Nov 2 run: exception CBR1_1QECTTZ5EDRVM6W18H1Z_11_Karen is carrying two tags: "Recertification Required", and "Recertification due to rule change", keep the first one is OK.


## Round 3
### Bugs
1. Rule 95 was updated to Rule 95, CBR1_1QECTTZ5EDRVM6W18H1Z_1_Alice should be replaced with CBR1_09ZGBK98QSKPZHQE39AS_1_Alice, but exception tracking still shows as 2 separate exceptions. The exception id for R095 should be updated with R096. For other exceptions under R095, which no longer an exception under R096, then no need to update and carrier forward. Since they are not exception anymore.
2. From the uploaded commentary template, if recertificate exception with "Updated, but commentary empty", should be marked as "Not Commented" instead of "New"