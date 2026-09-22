# Rule Configuration Compatibility Fix

## Problem

Older active-rule files under `config/rules/rules.yaml` use backend wire
fields such as `column_name`, `target_value`, and operators such as `eq` and
`gt`. Newer named configurations use the frontend domain representation.

The loader previously treated the wire representation as a domain rule. This
caused the mapper to emit missing logic fields, producing backend errors such
as:

```text
logic.column_name: This field is required
logic.operator: This field is required
logic.target_value: This field is required
```

Older configurations could also omit `conditions`, which caused the browser
to crash while calling `.map()` on `undefined`.

## Fix

- Legacy wire-shaped rules are converted to domain drafts before import.
- Wire operators are normalized to domain operators and mapped back safely.
- Missing legacy condition arrays are treated as empty arrays.
- Rule mapping now guards optional condition arrays.
- Deleted or superseded catalog rules continue through the explicit conflict
  decision flow instead of being silently imported.

After deploying the rebuilt `frontend/dist/`, perform a hard browser refresh.
