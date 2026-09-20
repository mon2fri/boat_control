# 2026-09-18 Rule Identifier Acceptance Findings

Review point: `ba1b307` on `work/cbri-integration`  
Disposition: **No release-blocking findings**

## Acceptance Evidence

- `npm --prefix frontend test -- --run src/pages/RulesPage.test.tsx src/features/rules/SortableRuleList.test.tsx src/api/mapping.test.ts src/journey.test.tsx src/features/configs/ConfigManager.test.tsx`: **5 files, 51 passed**.
- `uv run pytest -q tests/backend/test_rule_identifier_release_review.py tests/backend/test_rule_identifiers.py tests/backend/test_rule_repository.py tests/backend/test_rule_catalog_api.py tests/backend/test_rule_migration.py tests/backend/test_runs.py tests/backend/test_persistence.py tests/backend/test_run_detail_views.py tests/backend/test_reports.py tests/contracts tests/integration`: **119 passed**.

## Scenarios Reviewed

- Equivalent rules retain identifiers through condition reorder, grouping reorder, same-operator reassociation, and multi-value reorder/deduplication.
- Non-equivalent rules differ for threshold redundancy, exact string changes, duplicate predicates, mixed topology, and logic changes.
- Create/save, presentation-only edit, business-logic edit/versioning, enablement, import/export, and read-only identifier behavior passed.
- Initial catalog plus enabled pinning, continuation pages, deduplication, and more-than-50 pagination passed.
- New validation results, persisted bindings, detail/report rendering, and legacy runs without guessed identities passed.
- UI Rules page, selection, mapping, config manager, upload-to-results journey, and pagination-focused behavior passed.

## UX Observation

The Rules page keeps the canonical identifier in the wire/domain mapping and does not substitute it for
the user-facing rule name or local `Rxxx` label. This is consistent with the acceptance plan, which
does not require prominently displaying the canonical value when the page does not expose it. No UX
regression or accessibility failure was observed in the focused journey suite.

No requirement is marked fulfilled by this findings document; it records acceptance evidence and the
absence of release-blocking findings only.
