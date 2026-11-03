# Worker A — SQLite history and identity foundation

Branch: `work/20261103-exception-tracking-worker-a`

Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/exception-tracking/worker-a`

Read requirements/20261103_exception_tracking_enhancement.md and the coordinator/reviewer instruction before coding. Work only in your assigned worktree and branch. Do not modify another worker's files, live data, or the original checkout. Use isolated temporary databases, settings and test output. Commit scoped code, meaningful tests and documentation. Do not merge other branches yourself; request dependency commits from the reviewer. Work may start in parallel using the contract below; final integration requires real dependencies and tests, not mocks alone.

Shared contract proposal (reviewer freezes before integration): as_of_date is an ISO calendar date propagated from upload through run submission and persisted run metadata. Default is the last Monday–Friday of the previous month, including January/year rollover. Tracking is a separate SQLite file defaulting to project-root/data/exception_tracking.db. Use canonical exception_rule_identifier and ordered configured key-column VALUES to form the literal underscore-separated exception_id required by the requirement; key_columns stores a documented lossless representation of those values. Do not silently hash or escape the requested ID; detect ambiguous collisions and report them. Dates/table identifiers must be strictly validated and safely quoted; bind data values. Timestamps use timezone-aware UTC. Preserve canonical rule identifiers and existing run compatibility. Backend is authoritative for status and default date.

Proposed semantics requiring reviewer sign-off: history metadata uses chronological min/max as-of dates and occurrence timestamps across all date tables, including backdated runs. Nonblank commentary means Commented; otherwise earliest-date occurrence is New, later occurrences are NotCommented. Carry the most recent applicable commentary forward without overwriting explicit edits. Same-date reruns upsert idempotently without dropping commentary or unrelated exceptions. Do not delete historical exceptions on rerun. Document timestamp and commentary precedence explicitly. Missing identity/key data must produce a visible actionable error, never guessed IDs. Historical runs without tracking dates remain readable.

Handoff: report commit hashes, changed files, requirement coverage, exact test commands/results, API/schema decisions, remaining issues and git diff --check result. Do not claim complete with known requirement gaps.

## Scope and acceptance

Own new backend/apps/exception_tracking repository/identity/domain modules (not API or workbook modules), and dedicated tests/backend/test_exception_tracking_store*. Implement safe date tables with all ten requested columns, cross-date history/status/commentary lookup and transactional upsert/update interfaces. Support configurable database paths via an injected resolved path; B owns settings persistence. Publish Python signatures early for B/C. Test duplicate IDs, underscore collisions, composite/null/Unicode keys, backdated runs, repeated runs, reopen persistence, rollback, and commentary/history behavior.
