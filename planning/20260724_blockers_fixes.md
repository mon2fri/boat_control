# 2026-07-24 Blockers Fixes

## Objective

Fix four remaining blockers in the nested aggregation and comparison sections feature.

## Blocker 1: Editing existing section could delete it prematurely

### Problem

The `ComparisonSectionEditor` dispatched `setComparisonSections` on every keystroke. The reducer immediately removes sections with an empty name or no columns. Therefore:

- Clearing the name while editing removed the entire section
- Temporarily deselecting all columns removed the section
- The editor could be left referencing an ID that no longer exists

### Solution

Rewrote `ComparisonSectionEditor` to use local draft state for both new and existing sections:

- Added `Draft` interface and `draft` state
- When editing an existing section, create a local copy in `draft` state
- `handleDone` validates and commits to parent state
- `handleCancel` discards local changes
- Parent state is only updated on valid confirmation

### Files Changed

- `src/features/targets/ComparisonSectionEditor.tsx` - Complete rewrite with local draft editing

## Blocker 2: Duplicate-name validation was incorrect for new drafts

### Problem

A new draft was not included in `nameCounts`. If an existing section was named "Financial", a new draft named "Financial" saw a count of 1, but validation rejected only counts greater than 1. Consequently, a new duplicate name could be committed.

### Solution

Updated `nameCounts` calculation to exclude the section being edited:

```typescript
const nameCounts = useMemo(() => {
  const counts: Record<string, number> = {};
  const editingId = draft?.id;
  for (const s of sections) {
    // Skip the section being edited so its old name doesn't conflict
    if (s.id === editingId) continue;
    const trimmed = s.name.trim().toLowerCase();
    if (trimmed) counts[trimmed] = (counts[trimmed] ?? 0) + 1;
  }
  return counts;
}, [sections, draft?.id]);
```

Changed validation threshold from `count > 1` to `count > 0`.

### Files Changed

- `src/features/targets/ComparisonSectionEditor.tsx` - Updated validation logic

## Blocker 3: Persisted-result restoration was incomplete

### Problem

The deep-link loader only restored:
- The result
- Nested aggregation when true
- Non-empty aggregation columns

It did not restore:
- `keyColumns` - missing key-column labels and headers after refreshing a Results URL
- `nestedAggregationEnabled` when false - stale nested-aggregation settings
- Empty `aggregationColumns` - stale aggregation columns when the newly loaded run has none

### Solution

Updated the deep-link loader in `ResultsPage.tsx`:

```typescript
// Always restore nested-aggregation flag (including false).
dispatch({ type: "setNestedAggregationEnabled", enabled: result.nestedAggregationEnabled ?? false });
// Always restore aggregation columns (including empty array).
dispatch({ type: "setAggregationColumns", columns: result.aggregationColumns ?? [] });
// Restore key columns if present in the persisted result.
if (result.keyColumns && result.keyColumns.length > 0) {
  dispatch({ type: "setKeyColumns", columns: result.keyColumns });
}
```

### Files Changed

- `src/pages/ResultsPage.tsx` - Updated deep-link restoration logic

## Blocker 4: Delivery evidence was outdated

### Problem

The delivery document reported 288 frontend tests and 210 backend tests. Current observed totals were 308 and 216 respectively. It also did not record manual verification of expansion, ordering, and saved-run reload.

### Solution

Updated the delivery document with:
- Correct test counts: 313 frontend (38 files), 216 backend
- Manual verification notes for expansion, ordering, and saved-run reload

### Files Changed

- `planning/20260724_delivery_nested_aggregation_comparison_sections.md` - Updated test counts and verification notes

## Additional Fix: Rule config loading numbering

### Problem

When loading a rule config, the `next_index` counter was not reset, causing rules to be numbered sequentially from where the previous config left off (e.g., R012-R023 instead of R001-R012).

### Solution

Added an atomic `replace_rules` endpoint that validates all draft rules, assigns sequential IDs from R001, and writes the complete collection. The frontend config-loading effect calls `replaceRulesApi(drafts)` instead of individual delete+create.

### Files Changed

- `apps/rules/services.py` — Added `replace_rules()` service function
- `apps/rules/views.py` — Added `ReplaceRulesView` (POST `/rules/replace/`)
- `apps/rules/serializers.py` — Added `ReplaceRulesSerializer`
- `apps/rules/urls.py` — Added `path("replace/", ...)`
- `src/api/wire.ts` — Added `replaceRulesResponseSchema`
- `src/api/endpoints.ts` — Added `replaceRules()` function
- `src/pages/RulesPage.tsx` — Config loading uses `replaceRulesApi(drafts)` instead of individual deletes

## Additional Fix: Config-removal Remove buttons broken

### Problem

The Remove button for saved configurations failed after the backend already deleted the file.

**Root cause**:
1. `client.ts:78` converted empty response bodies to `null`, but `z.void()` expects `undefined`.
2. Config names in URLs were not encoded, breaking names with special characters.

### Solution

Empty bodies resolve to `undefined` for `z.void()` compatibility; all config endpoints use `encodeURIComponent(name)`.

### Files Changed

- `src/api/client.ts` — Empty body resolves to `undefined` instead of `null`
- `src/api/endpoints.ts` — All config endpoints use `encodeURIComponent(name)`

## Tests Added

| File | Tests |
|------|-------|
| `src/features/targets/ComparisonSectionEditor.test.tsx` | 5 new tests for duplicate-name validation, non-premature deletion, and cancel behavior |
| `tests/backend/test_rules.py` | 11 new tests (8 service + 3 API for replace_rules) |
| `tests/backend/test_configs_api.py` | 4 new tests for config deletion (204, 404, all config types) |
| `src/api/client.test.ts` | 1 new test for 204 empty-body z.void() compatibility |
| `src/api/endpoints.test.ts` | 2 new tests for replaceRules endpoint function |
| `src/pages/RulesPage.test.tsx` | 1 new test for no individual DELETEs on render |

## Verification

- Frontend: 333 tests pass (40 files)
- Backend: 231 tests pass (backend + contract + integration)
- Production build: `npm run build` succeeds
- TypeScript compilation: No errors
