# S35 empty population — cause and workaround

Date: 2026-11-09. Branch: `work/20261108-grouped-validation-integration`.
Status: known unresolved column-family filter loading defect; no code fix in this delivery.

## Observed cause

S35 stores the following filter scope:

```text
system contains "oomber"
AND (Test equals "active" OR Test equals "inactive")
```

The `Test` column family contains `name`, then `status`.
`frontend/src/api/configContent.ts::resolveConfigFilterRow` assigns only
`colResult.resolved[0]` to the runtime filter. Both family filters therefore
become `name` filters; the loader silently ignores the later `status` member.

Saved runs `f5d99d86911e` and `b78f8ae36370` confirm the submitted expression:

```text
system contains "oomber"
AND (name equals "active" OR name equals "inactive")
```

Both returned zero baseline/comparison records and zero violations. No values in
`candidate.csv`'s `name` column equal `active` or `inactive`; the population is
empty before rule validation. The New Exceptions Only display scope does not
cause this empty-population result. Another saved run (`59b94ea1def0`) submitted
only the two `name` filters with no tree and likewise selected zero records.

## Concrete-column workaround

In S35, replace filters 2 and 3 with the concrete `status` column, preserving
both values and the existing OR subgroup. The resulting intended scope is:

```text
system contains "oomber"
AND (status equals "active" OR status equals "inactive")
```

Read-only evaluation against the original root `candidate.csv` selected 20 of
40 comparison records. The `system contains "oomber"` filter alone also selected
20. This is a population expectation, not an exception-count promise: exception
counts depend on enabled rules, data and commentary display scope.

## Deferred implementation

The loader must not silently select the first family member. A code fix needs
explicit family-member combination semantics, preserved grouping references,
load/save/run/history round trips and regression coverage. The status-only
workaround is not a definition of generic family AND/OR behavior.

This documentation commit does not rewrite S35's family references or change
family semantics. The user's existing S35 version-counter update (9 to 11) is
included as requested. User CSVs and live databases are not committed.

## Validation and delivery

The finding was checked against the saved config, family membership, current
loader source, saved-run API responses and root CSV values. No tests were rerun
for this documentation/version-only commit. Implementation commits being pushed
already contain their test/build/browser evidence in the paired implementation
and review records. Diff whitespace and YAML parsing were checked before commit.
