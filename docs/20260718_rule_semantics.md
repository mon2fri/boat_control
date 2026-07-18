# Rule semantics — required state vs. violation condition

Date: 2026-07-18  
Owner: Worker B  
Status: Frontend aligned with required-state semantics; awaits Worker A confirmation.

## Decision (Worker B stance, pending Worker A confirmation)

A rule describes the **required valid state** for one column (and optionally a
narrowed set of rows via conditions). Rows that *match* the rule's logic are
valid. Rows that *do not match* are reported as violations.

This matches how users naturally express validation intent ("status must equal
active") and removes the prior inverted behaviour where the example rule
`status eq active` flagged active records as violations.

## What changed

- `describeLogic()` in `features/rules/useRules.ts` now uses required-state
  phrasing (`status must equal "active"`) instead of bare operator words.
- `RuleEditor.tsx` now shows:
  - a collapsible **How rules work** help block explaining the semantic, and
  - a live preview line under the logic fieldset rendering the rule in plain
    English as the user types.
- `mapRunDocumentToResult()` strips the leading `Violated ` from the backend
  detail text and rephrases it as `did not match …` so result rows read as
  "row did not match required state" rather than "row violated rule".

## Cross-owner dependency

Worker A must:

1. Codify this decision in `docs/20260718_api_contract.md` (replace the line
   that today says rule logic describes a "violation condition").
2. Flip the evaluator behaviour so the rule fires on the inverse of the
   operator (`status eq active` means *status must equal active*; non-matching
   rows are the violations).
3. Update `apps/rules/services.py` and `apps/runs/services.py` so the
   `details` text and the `violations_by_rule` counts reflect the new semantic.

Until Worker A's evaluator change lands, the frontend will render the rule in
required-state language but the backend will still fire on the inverse
condition. The UI wording is forward-compatible and does not need to change
again once Worker A confirms.

## Tests

- `features/rules/RuleEditor.test.tsx` should assert the preview line renders
  required-state phrasing and that the help details element is present.
- `useRules.test.ts` (new) covers `describeLogic` for each operator.
- The conformance test in `tests/integration.test.ts` will continue to parse
  the wire document; once Worker A flips the evaluator, the fixture should be
  regenerated and the result detail text re-asserted.