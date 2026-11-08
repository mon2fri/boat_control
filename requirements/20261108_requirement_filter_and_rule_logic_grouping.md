# Grouped row filters, grouped rule outcomes, and null/blank handling

Date: 2026-11-08
Status: Requirements agreed in conversation; implementation not started.

## Purpose and scope

Extend the existing configuration workflow so users can group overall row filters
and configure grouped expected outcomes across multiple columns within a rule.
Apply consistent null/blank matching semantics across Row Filters, Rule Condition,
and Rule Logic.

This document records requirements only. It does not authorize implementation in
the current task. The screenshots in `screenshots/photo_2026-11-08_*.jpg` provide
business context; this enhancement supplies configurable capabilities rather than
hard-coding those business controls.

## 1. Logical grouping for overall Row Filters

Multiple row filters already exist. Add logical grouping to those filters using
the same grouping interaction and capabilities available in the rule condition
configuration section, including nested groups.

- Each configured filter is a selectable leaf in the grouping expression.
- Users can combine filters or groups with AND or OR.
- AND requires every child filter/group to match.
- OR requires at least one child filter/group to match.
- Evaluate the resulting expression as the overall row-selection predicate.
- Grouping changes how existing filters combine; each filter retains its own
  column, operator, and configured value or values.
- A single filter requires no grouping. No filters impose no row restriction.
- For multiple filters, provide the same AND, OR, and custom grouping choices as
  the existing rule condition configuration.
- Prevent saving or running an incomplete or invalid expression, including
  references to removed filters or configured filters omitted from the expression.
- Adding, removing, or editing filters must keep grouping references valid or
  clearly require the user to repair the expression before saving/running.

Example population expression:

```text
((Book type = MO AND SYSTEM = Traded Risk) OR Book type = FO)
AND STATUS = Active
AND RG_REGION = Asia Pacific
```

The example illustrates grouping only; actual population values remain user
configuration.

## 2. Multiple grouped expected outcomes in Rule Logic

When users select **Value against Column(s)**, allow them to configure multiple
expected-outcome clauses against multiple columns within the same rule.

- Each clause has its own column, operator, and expected value or values.
- Allow users to add, edit, and remove outcome clauses.
- Provide a grouping section using the existing rule condition grouping pattern,
  including AND, OR, and nested custom groups.
- AND means all grouped expected outcomes must be satisfied on the same record.
- OR means at least one grouped expected outcome must be satisfied on that record;
  satisfying multiple outcomes also passes.
- A single outcome clause requires no grouping.
- Require at least one complete outcome clause and a valid grouping expression
  before saving/running. Apply the same reference/completeness validation as for
  grouped row filters.
- Keep the current column-against-column capability available. Multiple grouped
  column-against-column outcomes are outside this requirement.
- Preserve existing within-clause multi-value semantics: equals/contains match
  any configured value; not equals/not contains match none of the configured
  values. Grouping combines whole clauses, independently of these value lists.

Examples:

```text
SA Contributory = Y OR SA-CVA Hedge Book = Y
```

The record passes when either flag, or both flags, equals Y.

```text
SA Contributory = N AND SA-CVA Hedge Book = N
```

The record passes only when both flags equal N.

Example with two alternative groups:

```text
Group 1: (SA Contributory = Y AND SA-CVA Hedge Book = N)
OR
Group 2: (SA Contributory = N AND SA-CVA Hedge Book = Y)
```

Users must be able to configure these two AND groups joined by OR. For an
applicable record, the rule passes only for Y/N or N/Y. It raises a violation
when both flags are the same (Y/Y or N/N), or when either flag contains a value
outside Y/N, including null or blank. This example uses positive equality
clauses, so null/blank cannot satisfy either group under section 3.

| SA Contributory | SA-CVA Hedge Book | Result |
| --- | --- | --- |
| Y | N | Pass |
| N | Y | Pass |
| Y | Y | Violation |
| N | N | Violation |
| Any value outside Y/N | Any value | Violation |
| Any value | Any value outside Y/N | Violation |

Rule evaluation retains required-state semantics: after the overall row filters
select a record, a rule applies only when its Rule Condition expression matches.
An applicable record is a violation when its grouped Rule Logic expression is
false. A non-matching Rule Condition means the rule does not apply to that record.

## 3. Consistent null/blank semantics

Apply the following behavior in **Row Filters**, **Rule Condition**, and
**Rule Logic**. Null and blank input values must receive the same result.

| Operator | Null/blank input satisfies the clause? |
| --- | --- |
| Equals | No |
| Contains | No |
| Not equals | Yes |
| Not contains | Yes |

For this requirement, null means a missing value in an existing input column and
blank means an empty string. Whitespace-only handling is not specified by the
agreed requirement and must be settled explicitly before implementation; do not
silently introduce trimming or case normalization.

- Apply this behavior before combining clauses through AND/OR groups.
- Apply it consistently for single-value and multi-value clauses.
- In Row Filters, the clause result contributes to whether the record is retained.
- In Rule Condition, it contributes to whether the rule applies.
- In Rule Logic, it contributes to whether the required state is satisfied. Thus,
  null/blank does not itself cause a violation for a negative operator.
- This supersedes the current unconditional null rejection in rule conditions
  and rule logic for the four operators above.
- Numeric operators and absent input columns are outside this semantic change.
  An absent column must not be interpreted as an ordinary null cell.

## 4. Persistence and compatibility

- Save and restore filter grouping in the configuration that owns Row Filters.
- Save and restore outcome clauses and their grouping in rule configuration.
- Preserve expressions through supported configuration save/load and import/export
  workflows, and through saved-run restoration where configuration is retained.
- Existing configurations without filter grouping retain their previous behavior.
- Existing rules containing one logic clause remain valid and retain their
  structure and behavior, except for the intentional null/blank changes above.
- Grouping and multiple outcomes must be represented consistently in frontend
  state, API validation, backend evaluation, and persisted configuration.
- Canonical rule identity must account for the complete outcome expression so
  rules with different business logic are not treated as equivalent.
- User-facing previews and validation messages must reflect the full expression,
  including grouping, rather than showing only one filter or outcome.

## 5. Operational handling and deferred scope

### Approved exceptions: operational change only

Handle approved exceptions and supporting rationale by updating the operating
model. No approval registry, approval workflow, new exception status, or other
code enhancement is requested for this point.

### Business control metadata and reporting: future enhancement

Defer the previously discussed business control references, categories,
objectives, owners, mappings to technical rules, and additional population or
approval reporting. They are not part of this implementation scope.

## 6. Acceptance criteria

1. Users can configure and restore a nested overall filter expression such as
   `(F1 AND F2) OR F3`; selected records match its truth table.
2. Existing filter configurations load without changing their combination
   behavior, subject to the agreed null/blank semantics.
3. One rule can require `A = Y OR B = Y`: Y/N, N/Y, and Y/Y pass; N/N fails.
4. One rule can require `A = N AND B = N`: N/N passes; N/Y, Y/N, and Y/Y fail.
5. Nested outcome groups evaluate correctly, for example
   `(A = Y OR B = Y) AND C = Active`.
6. Null and empty-string inputs produce the table in section 3 for every listed
   operator in all three configuration areas, including multi-value clauses.
7. For `A = Y OR B = Y`, null/Y passes and null/N fails. For
   `A != Y AND B != Y`, null/N passes and null/Y fails.
8. Rules whose conditions do not match produce no violation for those records;
   rules whose conditions match and outcomes fail produce violations.
9. Saving, loading, exporting, and importing preserves every clause and grouping
   expression. Legacy single-outcome rules remain usable.
10. Removing a referenced filter/outcome cannot silently execute an altered or
    incomplete grouping expression.
11. Changes to grouped business outcomes are reflected in canonical rule identity
    under the existing identity/lifecycle policy.
12. Column-against-column configuration remains usable, with the section 3
    operator semantics applied to null/blank input values where applicable.
13. Users can configure `(SA Contributory = Y AND SA-CVA Hedge Book = N) OR
    (SA Contributory = N AND SA-CVA Hedge Book = Y)` as two AND groups joined by
    OR. For applicable records, only Y/N and N/Y pass; Y/Y, N/N, and any pair
    containing a value outside Y/N (including null or blank) raise a violation.
