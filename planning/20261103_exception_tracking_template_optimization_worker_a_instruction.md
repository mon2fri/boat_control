# Template optimization — Worker A addendum

Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/exception-tracking/worker-a`
Branch: `work/20261103-exception-tracking-worker-a`

Read the latest `### Exception Tracking Template optimization` requirement from the integration worktree, your original worker instruction, and this addendum. The requirement section is newer than prior template layout requirements and supersedes their conflicting ordering/hiding rules. Work only in your existing assigned branch/worktree. Preserve unrelated dirty files and live databases. Do not merge main/integration or independently cherry-pick dependencies without reviewer coordination.

## Shared contract to freeze before implementation

Publish the agreed wire fields, Python signatures and examples to the reviewer before implementations diverge. A owns persisted schema/service interfaces; B owns tracking endpoints/workbook layout and contract fixtures; C owns run request/capture/report propagation; D owns frontend types/mappers and controls. Exactly one owner per file; reviewer owns shared root configuration and generated frontend/dist.

- Use stable Exception ID for joins. Rule Index is historical run-local context, never exception identity; agree deterministic behavior for multiple runs on the same date. Never derive it from current catalog order.
- Keep distinct settings for existing Extra Column and the new Extra Columns for Commentary Template. Freeze ordered selected names, baseline/comparison source semantics for duplicate names and missing values, configuration save/load and saved-run restoration. Do not guess or silently overwrite colliding names.
- Persist selected detail values at capture time, per exception/date. Later source uploads must not be required to retrieve/export them. Define a stable ordered schema union so columns introduced later appear empty on older records, without fabricated backfill. Avoid duplicate reserved headers.
- XLSX and tracking UI order: Exception ID, Exception Status, Commentary, Rule Index, then remaining exception-table/detail columns in stable existing order. First four visible by default; later columns hidden by default (XLSX hidden column dimensions; UI column chooser). Hidden data remains exportable/revealable.
- “New Exceptions Only” defaults checked but includes both New and NotCommented; it excludes Commented. This is a display/report filter, never a persistence filter. Persist all exceptions first; derive filtering from authoritative tracking status for the selected date. Freeze behavior on commentary edits, reruns, restored legacy runs, totals and empty filtered results. Commentary templates always contain all exceptions, with New/NotCommented before Commented and deterministic ordering within groups.
- Informational appended values stay outside commentary-import business validation. Preserve ID/date/required-field validation, atomic updates and spreadsheet text protections. Account for changed headers/order with a documented template version/backward compatibility policy.

Parallel work can proceed against frozen interfaces/fixtures. Final completion requires integrated real-dependency checks. Report dependency needs rather than replacing another owner's implementation. Use temporary databases and isolated fixtures. Handoff committed hashes, files, requirement coverage, exact test results, migrations/compatibility notes, unresolved issues and git diff --check.

## Worker A — persisted historical context

Own tracking repository/domain/schema migrations and dedicated storage tests. Add backward-compatible persistence for ordered template-column metadata and per-exception values, plus Rule Index context where not already persisted. Expose transactional APIs for C capture and B read/export. Support schema union/empty historical values across dates without rewriting prior business values. Preserve commentary/history on same-date upserts; document multi-run precedence and handle missing old context. Test migration from existing populated databases, restart retrieval, later-added columns, missing values, collisions, backdated runs and rollback. Publish interfaces first; do not own workbook/API/report/frontend files.

## Updated scope clarification — commentary extra columns

The latest requirement subsection “Commentary template extra-column selection and configuration” takes precedence over automatic exception-detail appending. The card label is Extra Columns for Commentary Template. Only its ordered selection supplies appended data columns; never infer these from Extra Column, attribute comparison or exception-table fields. An empty selection adds no data columns. Standard tracking metadata remains intact. Persist and restore the ordered selection in Config for rows and columns; old configs lacking the field clear it to empty. A owns stored values/selection metadata, B owns exports/API enforcing the sole selection source, C owns backend rows-and-columns config serialization/validation and run capture, D owns card naming, frontend config save/load and selection state. C/D must inspect the actual config code paths and agree wire fields; if files fall outside original ownership, coordinate explicit reassignment with reviewer. Test independent selections, empty selection, order preservation, config roundtrip and old-config clearing.
