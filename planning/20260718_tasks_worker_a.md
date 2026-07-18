# Worker A Task List — Backend and Data

## Mandatory working protocol

For **every numbered checklist item**, complete its four sub-checks in order: **Follow** the
requirements and existing plan, **Code** the implementation and tests, **Document** behavior and
decisions, then **Review** your own diff and test evidence. An item is incomplete if any sub-check
is unchecked. Do not move, rename, delete, rewrite, or reorganize the `planning/` directory or
files. You may only mark checkboxes in this assigned task file; record substantive findings in
`docs/` or `reviews/`.

## Checklist

1. [ ] Scaffold the Django project and domain app boundaries.
   - [ ] Follow: read the initial requirement and folder structure plan before editing.
   - [ ] Code: create settings, URLs, health endpoint, and apps for files, rules, runs, reports.
   - [ ] Document: add local startup and configuration guidance under `docs/`.
   - [ ] Review: run checks/tests and inspect settings for local-only runtime behavior.

2. [ ] Implement safe CSV intake and header inspection.
   - [ ] Follow: honor common-column-only processing and large-file constraints.
   - [ ] Code: validate paths/uploads, inspect headers, report differences and common columns.
   - [ ] Document: describe limits, accepted encodings, errors, and API payloads.
   - [ ] Review: test malformed, duplicate, missing, hostile-name, and large-header cases.

3. [ ] Implement filter and target-column preparation APIs.
   - [ ] Follow: implement operators and one-file-only value restrictions exactly as required.
   - [ ] Code: return searchable columns/values, validate filters, and confirm full-set runs.
   - [ ] Document: define request/response schemas and confirmation thresholds.
   - [ ] Review: test operator semantics, nulls, types, absent columns, and the 2,000-row rule.

4. [ ] Implement the validation-rule configuration service.
   - [ ] Follow: preserve optional conditions, grouping, two logic formats, and Rxxx identifiers.
   - [ ] Code: add validated CRUD, atomic YAML persistence, and remote-file configuration.
   - [ ] Document: publish the rule schema with examples and migration/version behavior.
   - [ ] Review: test invalid logic, grouping ambiguity, concurrent writes, and path safety.

5. [ ] Implement comparison and validation execution.
   - [ ] Follow: process only filtered rows and selected common target columns.
   - [ ] Code: build lazy/projected Polars pipelines and stable row/attribute result summaries.
   - [ ] Document: explain identity/matching assumptions, null semantics, and performance design.
   - [ ] Review: benchmark representative 120k × 200 input and test deterministic results.

6. [ ] Implement run persistence, retention, naming, and loading.
   - [ ] Follow: auto-save JSON, allow safe renaming, and preserve only the latest ten runs.
   - [ ] Code: use atomic writes, safe identifiers, metadata indexes, and transactional retention.
   - [ ] Document: describe JSON schema, retention order, recovery, and rename behavior.
   - [ ] Review: test crashes, collisions, corrupt files, traversal attempts, and retention edges.

7. [ ] Implement HTML and CSV exports.
   - [ ] Follow: export the current or loaded result without external runtime resources.
   - [ ] Code: escape HTML, mitigate spreadsheet formula injection, and stream large exports.
   - [ ] Document: list output formats, escaping rules, and known limits.
   - [ ] Review: add security tests and manually inspect representative outputs.

8. [ ] Complete backend integration and handoff.
   - [ ] Follow: reconcile APIs with worker B without changing files in `planning/`.
   - [ ] Code: finish contract/integration tests and production static-file integration.
   - [ ] Document: provide API reference, setup, test, build, and troubleshooting instructions.
   - [ ] Review: run Ruff, mypy, pytest with coverage, dependency audit, and final diff review.
