# Grouping-tree loss during rule-config export — 2026-09-22

## Issue

Saving a rule configuration omitted `grouping_tree` from the exported rule
payload. On a later load/import, the rule no longer had its executable
parenthesized expression. The runtime consequently fell back to a flat AND
between all conditions.

## Observed impact

The supplied screenshots demonstrate the issue with the Global BAU
Contributory rule:

- R016 correctly evaluates `Condition 1 AND (Condition 2 OR ... OR Condition 7)`.
- The generated R022 retained the same conditions and expectation but evaluated
  `Condition 1 AND Condition 2 AND ... AND Condition 7`.

The latter is effectively unsatisfiable when conditions 2–7 are mutually
exclusive contributor flags. It therefore produces no useful result and has a
different canonical rule identifier.

## Root cause

`_rule_snapshot_payload` in `backend/apps/configs/views.py` exported the
legacy `grouping` field but did not export `grouping_tree`, which is the
authoritative executable grouping representation. The frontend and backend
import path correctly understand `grouping_tree`; it was simply absent from
the saved configuration.

## Remediation

Commit `9e6a6ee` serializes `grouping_tree` during rule-config export using
the same wire representation used by the rules API. A backend regression test
now verifies that a grouped rule survives export/import with the same canonical
identifier and is reused instead of creating a flattened replacement rule.

## Recovery for affected catalogs

Existing flattened replacements, such as R022, cannot be automatically
repaired because the original grouping expression was lost in their stored
payload. After deploying the fix:

1. Disable or delete the malformed replacement rule.
2. Load/import a configuration containing the original grouped rule, or restore
   it through the editor with the intended grouping tree.
3. Save a fresh rule configuration and verify that `grouping_tree` is present.
