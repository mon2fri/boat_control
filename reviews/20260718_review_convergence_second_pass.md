# Worker A and Worker B Convergence Review — Second Pass

Date: 2026-07-18  
Reviewer: Primary agent  
Decision: **Changes still required. API convergence is materially improved, but the product does
not yet satisfy the acceptance gate.**

## Verification run

| Check | Result |
| --- | --- |
| Backend pytest | 72 passed |
| Frontend Vitest | 70 passed across 18 files |
| Frontend ESLint | Passed |
| Frontend TypeScript/Vite build | Passed; main JS 464.75 kB / 141.41 kB gzip |
| Ruff | **Failed: 11 findings in `tests/integration/run_e2e_workflow.py`** |
| mypy | **Failed before analysis: `ModuleNotFoundError: boat_control`** |
| Workflow walker, plain documented tool invocation | **Failed: `ModuleNotFoundError: boat_control`** |
| Workflow walker with explicit `PYTHONPATH=backend` | Passed |

The workflow walker uses DRF's in-process `APIClient`, then writes response fixtures for Vitest. It
does not start Django, serve the production React build, or drive a browser. It is useful contract
evidence but does not meet the live React-to-Django end-to-end gate by itself.

## Resolved or materially improved

- Upload now returns an opaque session ID instead of exposing upload paths.
- Frontend upload, preparation, rule, run, history, rename, and export calls now use snake_case wire
  adapters matching the implemented endpoints.
- Execution now automatically persists a result and returns the saved run document.
- `ncontains` now filters both inputs.
- Column-to-column rule evaluation has been added.
- Target, key, filter, and rule logic columns receive more execution-time validation.
- Run and rule mutations now use in-process locks.
- Rename updates the JSON body's report name as well as its index and filename.
- Frontend handling of scalar CSV values, expired sessions, export blobs, and keyboard-accessible
  rename behavior improved.
- Backend/fixture contract tests and a cross-boundary response-mapping fixture were added.

## Remaining findings

### Critical — empty rule selection executes every rule

The frontend maps an empty `ruleIndexes` array to `rule_ids: null`. The backend interprets a falsey
`rule_ids` value as “load all rules.” A user who deliberately deselects every rule therefore runs all
rules. Preserve the distinction between omitted/default-all and an explicit empty list, or choose one
unambiguous contract behavior and test it end to end.

### High — the canonical contract is internally inconsistent

`docs/20260718_api_contract.md` shows `comparison`, `validation`, and related fields at the top level
of the execute response. The backend and frontend Zod schema actually return/expect those fields
inside `result`. The hand-written Python `SCHEMA` also differs in places from the prose and is not
derived from serializers. Publish one accurate source of truth and assert real serialized examples
against both Zod and backend endpoint tests.

### High — rule meaning and grouping remain incorrect or undefined

The evaluator still records a violation when its logic expression returns true, but neither the
canonical contract nor rule UI clearly establishes whether expressions describe invalid states or
required valid states. The submitted example named “Status Check” with `status eq active` therefore
flags active records as violations.

Grouping is treated as a list of arbitrary group IDs: conditions inside each ID are ORed and groups
are ANDed. That representation cannot express the general mixed `and`/`or` grouping required, and
the UI converts a whitespace string to the list without a shared grammar. Define an expression tree
or constrained grouping grammar and round-trip it through editor, YAML, and evaluator tests.

### High — record identity remains an unsafe implicit assumption

The backend defaults to the first common column as the key, while the frontend never asks the user
for key columns. Duplicate values produce a many-to-many join and misleading row/change counts.
There are still no acceptance tests for duplicate keys, missing records, reordering, or null keys.

### High — large-file design remains unsuitable

Preparation still accepts a client-provided common-column list, eagerly counts both complete CSVs,
then rescans both files per requested column and returns all distinct values in one response.
Execution first materializes both full files for validation, rescans and materializes them again after
filters, then compares and validates row-by-row in Python. No 120k × 200 benchmark, peak-memory
measurement, pagination, or bounded result strategy was submitted.

### High — session and request validation is only partially hardened

- Sessions are process-local memory. Multi-worker deployment and server restart invalidate every
  upload; expired uploads are cleaned only when that exact session is accessed.
- Filter preparation still trusts a supplied `common_columns` list instead of always using or
  intersecting server session metadata.
- Filter validation accepts client-supplied common columns without a session.
- Upload files are not cleaned up when header inspection fails.
- Run history exposes the host `file_path`, which clients do not need.
- The server does not enforce the required no-filter/full-set confirmation decision.

### High — required features remain absent

Settings, saved-filter, and configured preset/network-source APIs are still absent. The settings UI
therefore cannot load or edit real settings, and preset mode cannot work against Django. Django also
does not serve the production React build or provide SPA fallback routes.

### Medium — result metrics/details are inferred rather than delivered

The frontend derives distinct violating rows from key strings and treats each rule hit as one
violating attribute because the backend does not supply explicit distinct-row, attribute-count,
violating-column, violating-value, or rule-logic fields. This can miscount multiple violations and
cannot render the requested per-attribute details reliably.

### Medium — persistence/export completeness remains open

In-process locks do not protect multiple Django workers. Retention still deletes old result files
before the new index is durably committed. Rename rewrites JSON non-atomically. HTML/CSV export still
silently truncates detail records instead of streaming or explicitly reporting pagination/limits.

### Medium — delivery gates and repository hygiene

- mypy remains broken despite being an explicit Worker A follow-up.
- The new workflow script violates Ruff and fails unless callers manually set `PYTHONPATH`.
- The fixture-generation script mutates the default rule configuration and runtime result history.
- Root `node_modules/`, generated build-info/cache/coverage files, uploads, and result fixtures remain
  in the worktree; root `node_modules/` is not covered by the current ignore rule.
- The original sample `main.py` remains.
- Neither worker marked completed planning/follow-up checklist items, so checklist status cannot be
  used as delivery evidence.

## Updated acceptance order

1. Fix the empty-rule-selection defect and decide rule validity/violation semantics.
2. Make the checked-in contract match the actual nested run document and add executable contract
   conformance tests instead of parallel hand-written descriptions.
3. Define record identity and an executable grouping representation.
4. Implement settings, saved filters, presets, and production React serving.
5. Redesign preparation/execution for bounded memory and payloads; submit the 120k × 200 benchmark.
6. Add a live browser-to-Django journey and make pytest, Ruff, mypy, frontend lint/tests/build all
   pass from documented commands.

Worker ownership remains as listed in:

- `planning/20260718_followups_worker_a.md`
- `planning/20260718_followups_worker_b.md`
