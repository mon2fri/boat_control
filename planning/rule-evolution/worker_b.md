# Worker B — commentary carry-forward and recertification lifecycle

Read `README.md`, `shared_contract.md`, and the requirements first.

Branch: `feat/rule-evolution-worker-b`
Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/rule-evolution/worker-b`

Verify your directory/branch/common base before editing. Every operation must
target this worktree explicitly. Report missing/dirty worktree state to the
integrator rather than editing the root checkout.

## Assignment

Own cross-revision commentary inheritance and its full backend lifecycle.
Use A's agreed lineage service; do not reverse-engineer SQL against A's tables
or guess predecessor links from Rxxx/name/identifier substrings.

Implement additive tracking-schema upgrades, provenance, pending
recertification, explicit acceptance, and correct status derivation. Preserve
existing commentary and intended clears, historical IDs, original dates, and
each occurrence's historical metadata. Extend dataclass records and serializers
backward compatibly. A changed rule creates a new exception ID, not an UPDATE
renaming the old row.

Thread target lineage/revision context into real run capture and persistence.
The September 30 → October 15 edit → October 30 example must work through actual
catalog/capture APIs without an October 15 run. Handle chains, latest eligible
dates, tombstones, key-schema changes, ambiguity, retries, and absence of an old
comment. Do not overwrite target commentary or reset recertification acceptance.

Implement agreed recertification/list/import/export API changes. Publish sample
JSON and acceptance request/error semantics to C through the integrator early.
Preserve run-scoped versus date-scoped template membership and zero-exception
templates; recertification must not broaden which exceptions a report contains.

Make pending items visible under New Exceptions Only across results, tracking,
HTML/Excel outputs, counts, status filters, sorting, and recapture. Do not let an
existing `commentary.strip()` check turn pending text into accepted commentary.
Include marker/provenance in XLSX output safely; existing template import IDs,
version/date positions, extra columns, and formula protection must keep working.

## Ownership

- `backend/apps/exception_tracking/` including raw SQLite migration logic,
  repository/domain, APIs, workbook, and tests.
- `backend/apps/runs/` capture, context, persistence, serializers and related
  reporting metadata needed for provenance/status, plus focused tests.
- `backend/apps/reports/` only changes necessary for recertification output.

Do not edit A's catalog models/migrations/services, C's frontend files, or
generated frontend bundles. A/B shared interface changes go through the
integrator. Use a stub of the agreed A interface only in focused tests; the
delivery must pass an actual integration check after A is available.

## Required evidence

Test cross-date carry, no edit-date run, multi-hop chains, pending-to-accepted
transition with unchanged text, acceptance retry, stale/unknown IDs, clears,
future-comment exclusion, target edits, key mismatch, equal-date ambiguity,
unrelated lineages, same-date snapshots, legacy tracking upgrade, transactional
failure, New Exceptions Only/report counts, and workbook round trips.

Use isolated configuration AND tracking stores. Commit code/tests and
`reviews/20261112_rule_evolution_worker_b_delivery.md`; deliver hashes, schema
upgrade strategy, API payloads, actual checks, and remaining issues. Do not push
or cherry-pick into the integrator's checkout yourself.
