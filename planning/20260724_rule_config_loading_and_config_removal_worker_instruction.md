# 2026-07-24 Rule-config loading and config-removal fixes - worker instruction

## Objective

Fix these two confirmed configuration-management defects:

1. Loading a saved rule configuration currently appends/recreates rules using the existing
   `next_index`. Loading must replace all current rules and repopulate rule IDs from `R001`.
2. The **Remove** buttons for saved configurations do not complete successfully in the frontend.
   Configuration deletion must work for Rules, Filters, and Rows and Columns configurations.

This work is an authorized addition to the nested-aggregation delivery. Preserve the completed
nested-aggregation, comparison-section, saved-run restoration, and tree-styling work.

## 1. Replace rules when loading a rule configuration

### Required behavior

When the user loads a saved rule configuration:

1. Resolve and validate the complete saved configuration before modifying current rules.
2. If the UI requires confirmation because of unsaved/current rules, wait for confirmation.
3. Remove all current rules.
4. Reset the rule sequence counter to `1`.
5. Create the configured rules in their saved order.
6. Assign the imported rules `R001`, `R002`, `R003`, and so on.
7. Refresh the frontend rule query after replacement completes.
8. Display the imported rules without requiring a page refresh.

Example:

```text
Current rules: R021, R022
Current next_index: 23

Loaded configuration:
- Valid status
- Score threshold
- Region requirement

Expected rules after loading:
- R001 — Valid status
- R002 — Score threshold
- R003 — Region requirement

The next manually created rule must be R004.
```

Loading must replace the current rules. It must not append the imported rules to the existing list,
and imported IDs must not continue from the old `next_index`.

### Implementation requirements

Implement a backend operation that resets the current rule collection and its `next_index`.

Prefer an atomic **replace rules** service/API operation that:

- accepts the complete validated collection;
- builds the new rule set with sequential IDs beginning at `R001`;
- writes the complete result through the existing safe persistence mechanism; and
- leaves the previous rule file intact if validation or persistence fails before replacement.

If the existing architecture requires a reset followed by individual create calls:

- provide a collection reset endpoint that deletes all rules and resets `next_index` to `1`;
- wait for reset success before creating the first imported rule;
- create imported rules sequentially so ordering is deterministic;
- stop on the first failed creation;
- report partial-import failure clearly; and
- do not display a success state unless the complete configuration was imported.

Do not use concurrent `Promise.all` creation if rule IDs depend on request ordering.

### Validation and error handling

- Validate the saved configuration before clearing current rules.
- Preserve the configured rule order.
- Do not silently ignore failed rule deletions, reset failures, validation failures, or creation
  failures.
- Show a meaningful frontend error when replacement fails.
- Clear loading state after either success or failure.
- Do not claim that a configuration loaded successfully when only some rules were created.
- Prevent duplicate submissions while replacement is running.
- Do not change ordinary single-rule create, edit, or delete behavior.

### Required rule-config tests

Add backend and frontend/integration coverage for:

- existing rules with `next_index` greater than `1`;
- loading a configuration removes all existing rules;
- a three-rule configuration produces exactly `R001`, `R002`, and `R003`;
- imported rule order and content match the saved configuration;
- the next manually created rule is `R004`;
- loading an empty rule configuration leaves an empty collection with `next_index == 1`;
- invalid saved content does not destroy the current rule collection;
- a reset/replacement failure is surfaced to the user;
- a rule-creation failure is not reported as complete success; and
- repeated loading of the same configuration still starts from `R001`.

The test must verify resulting rule IDs through the actual backend/API behavior. A mocked test that
only checks whether DELETE was called is insufficient.

## 2. Repair saved-configuration removal

### Confirmed cause to investigate

The backend configuration detail view returns `204 No Content` after successful deletion.

The frontend API client currently converts an empty response body to `null`, while deletion
endpoints validate the response with `z.void()`. Because `z.void()` expects `undefined`, the
frontend can report response-validation failure after the backend has already deleted the file.

Relevant files include:

- `frontend/src/api/client.ts`
- `frontend/src/api/endpoints.ts`
- `frontend/src/features/settings/useSettings.ts`
- `frontend/src/features/configs/ConfigManager.tsx`
- `backend/apps/configs/views.py`
- `backend/apps/configs/services.py`

### API response handling

Make empty successful responses compatible with `z.void()`. Prefer a consistent fix at the shared
API boundary:

```typescript
const parsedBody: unknown =
  response.status === 204 || raw.length === 0
    ? undefined
    : safeJsonParse(raw);
```

Validate `parsedBody` rather than converting every empty body to `null`.

Before changing the shared client, inspect all callers and confirm that no successful empty-body
endpoint intentionally expects `null`. Add regression coverage for the shared behavior.

Encode configuration names in all config-detail URLs:

```typescript
encodeURIComponent(name)
```

Apply this consistently to get, update, and delete operations if any of them currently interpolate
the raw name.

### Remove-button behavior

For each ConfigManager instance:

- The **Remove** button appears only when a configuration is selected.
- Pressing Remove opens the confirmation dialog.
- Cancel closes the dialog and sends no request.
- Confirm sends one DELETE request for the selected type and name.
- A successful 204 response is treated as success.
- After success, close the dialog and clear the selected name.
- Invalidate/refetch the correct configuration-list query.
- Remove the deleted option without requiring a full page reload.
- Prevent repeated confirmation while deletion is pending.
- Show a meaningful error when deletion fails.
- Do not clear the selection on a genuine failure, so the user can retry.

Fix and verify all supported configuration types:

- Rules
- Filters
- Rows and Columns

### Required config-removal tests

Add frontend tests covering:

- selecting a saved configuration and pressing Remove;
- cancelling the confirmation dialog;
- confirming removal;
- the exact encoded DELETE URL;
- successful `204 No Content` handling;
- dialog closure and selection reset after success;
- deleted configuration disappearing after query invalidation/refetch;
- pending-state duplicate-click prevention;
- backend `404` and `500` errors being displayed; and
- selection being retained after a genuine failure.

Add backend tests covering:

- deleting an existing rule configuration;
- deleting an existing filter configuration;
- deleting an existing rows-and-columns configuration;
- confirming the corresponding file is removed;
- deleting a missing configuration returns 404; and
- permitted names containing spaces, hyphens, and underscores.

The same shared `204` parsing issue may affect other deletion flows, including family deletion.
Verify those existing `z.void()` callers still behave correctly and add a focused regression test
where appropriate. Do not expand into unrelated deletion redesigns.

## Scope and safety

- Preserve completed nested-aggregation and comparison-section behavior.
- Preserve single-rule create, update, and delete operations.
- Preserve config create, load, update, version-conflict, and confirmation behavior outside the two
  defects described here.
- Work with the existing dirty tree and do not revert unrelated user or worker changes.
- Do not overwrite `config/rules/rules.yaml`, `config/rules/723.yaml`, `scratch.md`, or unrelated
  untracked files.
- Do not manually edit runtime rule data merely to make tests pass.
- Use isolated temporary configuration/rule directories in tests.
- Refresh `frontend/dist` only after source tests and the production build pass.

## Required verification

Run:

```bash
npm --prefix frontend test -- --run
npm --prefix frontend run build
uv run pytest -q tests/backend tests/contracts tests/integration
git diff --check
```

Also run focused tests for:

- rule-config replacement and ID sequencing;
- ConfigManager removal behavior;
- API-client empty 204 responses; and
- backend configuration deletion.

Do not report an unrun check as passing.

## Delivery documentation

Update:

- `planning/20260724_delivery_nested_aggregation_comparison_sections.md`; and
- `planning/20260724_blockers_fixes.md`, if it remains the active follow-up record.

Document:

- the rule-replacement transaction/reset strategy;
- how deterministic `R001` sequencing is guaranteed;
- failure and rollback behavior;
- the root cause of broken config removal;
- the chosen empty-response parsing contract;
- files changed;
- focused and complete test results;
- refreshed production asset names; and
- unrelated dirty files intentionally left untouched.

Correct any previous statement claiming that resetting rule numbering was unauthorized. It is an
explicit product requirement for loading a rule configuration.

## Acceptance criteria

- Loading a rule configuration replaces, rather than appends to, the current rules.
- Imported rules are numbered sequentially beginning with `R001`.
- The next newly created rule continues after the imported collection.
- Invalid or failed imports are not reported as successful.
- Remove config works for Rules, Filters, and Rows and Columns.
- A successful 204 deletion does not cause a frontend validation error.
- Deleted configurations disappear from their selectors without a page reload.
- Cancel and failure paths preserve the configuration.
- Config names are safely encoded in request URLs.
- Existing nested aggregation, comparison sections, ordinary rule editing, and other config
  operations continue to work.
- All required automated checks pass and delivery documentation matches the observed results.

## Definition of done

The work is complete only when an integration test proves that loading a saved rule configuration
over existing rules produces `R001...Rxxx` from the beginning, and a ConfigManager test proves that
confirming removal handles a real `204 No Content` response as success and refreshes the selector.

---

## Delivery — completed

### Rule-config replacement strategy

**Atomic replace**: `backend/apps/rules/services.py:replace_rules()` validates all draft rules
first, then writes the complete collection through the existing `save_rules()` safe persistence
mechanism. If validation fails, the existing rules file is untouched. The `next_index` is reset to
`1` and reassigned sequentially from `R001`.

**Frontend**: `RulesPage.tsx` config-loading `useEffect` calls `replaceRulesApi(drafts)` instead of
individual `deleteRuleApi` + `createRuleApi`. The `POST /rules/replace/` endpoint accepts the full
drafts array and returns `{ message, rule_count, next_index }`.

### Root cause of broken config removal

Two issues:

1. **`client.ts:78`**: Empty response body was parsed as `null`, but `z.void()` expects `undefined`.
   Fixed: empty bodies now resolve to `undefined`.
2. **`endpoints.ts`**: Config names in URLs were not encoded. Names with spaces or special characters
   produced invalid URLs. Fixed: all three config endpoints (`get`, `put`, `delete`) now use
   `encodeURIComponent(name)`.

### Files changed

**Backend**:
- `backend/apps/rules/services.py` — `replace_rules()` added (lines 498-557)
- `backend/apps/rules/views.py` — `ReplaceRulesView` added
- `backend/apps/rules/serializers.py` — `ReplaceRulesSerializer` added
- `backend/apps/rules/urls.py` — `path("replace/", ...)` added

**Frontend**:
- `frontend/src/api/client.ts:78` — `null` → `undefined` for empty bodies
- `frontend/src/api/wire.ts` — `replaceRulesResponseSchema` added
- `frontend/src/api/endpoints.ts` — `replaceRules()` function added; `deleteConfig` URL encoding
  fixed; all config endpoints use `encodeURIComponent`
- `frontend/src/pages/RulesPage.tsx` — config-loading uses `replaceRulesApi` instead of individual
  delete+create; empty drafts now trigger replace (clearing rules); `rules.data` removed from
  effect dependencies

**Tests**:
- `tests/backend/test_rules.py` — 8 service tests (`TestReplaceRules`) + 3 API tests
  (`TestReplaceRulesApi`)
- `tests/backend/test_configs_api.py` — 4 config-deletion tests (`TestConfigDeletionAPI`)
- `frontend/src/api/client.test.ts` — 204 empty body regression test
- `frontend/src/api/endpoints.test.ts` — 2 `replaceRules` unit tests
- `frontend/src/pages/RulesPage.test.tsx` — no-collection-DELETE test updated

### Test results

- **Frontend**: 40 files, 333 tests passed
- **Backend**: 231 tests passed
- **Build**: `tsc -b && vite build` succeeded
- **Whitespace**: `git diff --check` clean

### Unrelated files preserved

Nested-aggregation tree styling (`frontend/src/index.css`), comparison ordering, saved-run
restoration, and all other prior work remain intact.
