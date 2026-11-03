# Worker D delivery — exception-detail table identity

Branch: `work/20261103-exception-tracking-worker-d`

## Scope delivered (frontend portion)

- The per-rule exception-detail table and the cross-rule Exception Table now
  show a leading **Exception ID** column.
- The Exception ID replaces any positional row identifier; it is never derived
  from the rendered row number, page offset, or array index.
- Existing detail columns are preserved:
  - per-rule table: key columns, configured extra columns, Column, In Baseline,
    In Comparison;
  - aggregate table: key columns, Rule Index, aggregation columns, configured
    extra columns.
- Sorting/filtering continue to work; the aggregate table also offers filtering
  and sorting by Exception ID.
- Rows with incomplete identity data display `—` rather than guessing.

## Agreed Exception ID contract for Worker B

Worker B published `docs/20261103_exception_tracking_detail_template_contract.md`
(commit `027b6c1`) and implemented appended workbook details in `37c81e5`.
This frontend implementation follows that contract:

- Displayed column name: **Exception ID**.
- Preferred wire field on validation violations and paginated detail rows:
  `exception_id` (string).
- When supplied, the frontend displays it verbatim.
- When omitted by older payloads, the frontend derives the exact same literal
  used by the commentary workbook:
  `<exception_rule_identifier>_<ordered key value 1>_<ordered key value 2>...`
  using the run's configured key-column order and exact text values. Values are
  not escaped; missing/null/empty identity values produce no ID.
- Rule-identifier fallback follows B's published order: violation
  `rule_identifier`, then `result.rule_bindings[rule_id]`, then
  `result.validation.rule_summaries[rule_id].rule_identifier`.
- Worker B owns appended commentary-template detail columns and informational
  import handling. The frontend only consumes the same stable ID for table
  display; it does not add or validate workbook detail columns.

## Pagination

- `fetchDetailPage` now maps an optional `exception_id` from each paginated
  detail row.
- IDs come from backend rows, never from `offset`, page number, or rendered
  position. A focused test loads two violation pages and verifies identity
  stability.

## Tests

```bash
npm --prefix frontend test -- --run
# 53 files, 486 tests passed (at delivery)

npm --prefix frontend run build
# TypeScript + Vite build passed

npm --prefix frontend run build:inspect
# 5 tests passed
```

Focused coverage:
- `src/lib/exceptionIdentity.test.ts`
- `src/features/results/results.test.tsx`
- `src/features/results/ExceptionTable.test.tsx`
- `src/features/results/usePaginatedDetails.test.ts`
- `src/api/mapping.test.ts`

## Verification boundary / dependency

- Backend B formula/contract was inspected in the Worker B worktree, but its
  new commits were not yet integrated into the integration worktree during
  implementation. Frontend tests are mocked/fixtures only.
- Backend integration should confirm that workbook `Exception ID` values equal
  the table IDs and, if paginated exception detail rows are introduced, that
  they include `exception_id`.
- No backend files, live data, integration/main branches, or generated
  `frontend/dist` were modified or committed.
