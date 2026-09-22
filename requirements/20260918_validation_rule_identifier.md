This requirement is to set up a validation rule identifier for the system. The identifier will be used to uniquely identify each validation rule applied within the application.

The identifer should be something calculated by the set condition and corresponding values.
For example:
R001 with:
- Condition 1: `name` is `john`
- Condition 2: `region` is `east`
- Logic --> Value against column: `status` equals to `active`

R002 with:
- Condition 1: `region` is `east`
- Condition 2: `name` is `john`
- Logic --> Value against column: `status` equals to `active`

R003 with:
- Condition 1: `name` is `john`
- Condition 2: `region` is `west`
- Logic --> Value against column: `status` equals to `active`

R004 with:
- Condition 1: `name` is `john`
- Condition 2: `region` is `west`
- Condition 3: `name` is `zoe`
- Condition 4: `region` is `east`
- Grouping 1: AND(Condition 1, Condition 2)
- Grouping 2: AND(Condition 3, Condition 4)
- Grouping 3: OR(Grouping 1, Grouping 2)
- Logic --> Value against column: `status` equals to `active`

R005 with:
- Condition 1: `name` is `john`
- Condition 2: `region` is `west`
- Condition 3: `name` is `zoe`
- Condition 4: `region` is `east`
- Grouping 1: AND(Condition 3, Condition 4)
- Grouping 2: AND(Condition 1, Condition 2)
- Grouping 3: OR(Grouping 1, Grouping 2)
- Logic --> Value against column: `status` equals to `active`

For the above examples:
R001 shoudl have the same identifier as R002,
R003 should have different identifier from R001 and R002
R004 and R005 should have the same identifier.
In short, if conditions and logic are logically equivalent, they should have the same identifier, regardless of the order of conditions or groupings.
Otherwise, they should have different identifiers.

## Delivery Status

**DELIVERED** on the integration branch.

The delivered identifier is the versioned `CBR1_` identifier generated from the canonical business
definition, not the local `Rxxx` display ID. The implementation includes the SQLite catalog and
append-only identity registry, persisted enablement, atomic configuration import/export, run/result
bindings, legacy-run compatibility, catalog pagination, and frontend wire/domain integration.

Delivered user behavior:

- Existing-rule edits show the canonical identifier; business-logic edits replace the visible catalog
  row while preserving the prior version as archived history.
- New rules receive their calculated identifier on save. Blank new names are stored as `Unnamed` and
  leave the editor open for naming; blank names on existing-rule edits are rejected.
- Equivalent duplicate creates return a user-visible hint and do not overwrite the existing rule's
  metadata.
- Rule configuration save/load uses the SQLite enabled set and preserves Extra Column display checkbox
  state, filters, comparison columns, tracking columns, aggregation settings, and comparison sections.
- Rule and result cards, HTML reports, and exception-related Excel tables display canonical identifiers.
- Configuration-load notices are floating, appear below the application header, remain visible for three
  seconds, and fade out over three seconds without accumulating stale success messages.
- Multiple rule checkboxes can be enabled together and catalog row order is independent of selection.

Final verification evidence:

- Backend/contracts/integration tests: **283 passed**.
- Frontend tests: **420 passed**.
- Frontend production build: passed.
- Ruff and mypy: passed.
- Migration checks and `git diff --check`: passed, excluding only pre-existing whitespace in the user
  bug-report artifact.
