# Contract — Performance and Pagination Budgets

Version: 1
Date: 2026-07-18
Owner: Worker C
Status: **FROZEN** — Workers A and B must not independently change pagination or performance
requirements.

## 1. Pagination endpoints

### 1.1 Column values (on-demand)

| Parameter | Value |
|-----------|-------|
| Route | `GET /api/files/<session_id>/values/?column=<name>&search=<query>&offset=<n>&limit=<n>` |
| Default page size | 100 |
| Maximum page size | 500 |
| Stable ordering | Alphabetical by value |
| Search | Case-insensitive substring match on value |
| Response includes | `values: [{value, in_file_a, in_file_b, display}]`, `total`, `offset`, `has_more` |
| Starred values | Included in results with `display` field showing `*` suffix |

### 1.2 Run details (paginated)

| Parameter | Value |
|-----------|-------|
| Route | `GET /api/runs/<run_id>/details/?section=<changes\|violations>&rule_id=<id>&offset=<n>&limit=<n>` |
| Default page size | 100 |
| Maximum page size | 1000 |
| Stable ordering | Row index ascending |
| Sections | `changes` (attribute changes), `violations` (per-rule violations) |
| Response includes | `details: [...]`, `total`, `offset`, `has_more`, `section` |
| Total counts | Always present in response regardless of offset |

### 1.3 History (non-paginated)

| Parameter | Value |
|-----------|-------|
| Route | `GET /api/runs/` |
| Maximum entries | 10 (retention limit) |
| Ordering | Created at descending |
| Response | Array of run metadata objects |

## 2. Response caps

| Endpoint | Cap | Behavior on overflow |
|----------|-----|---------------------|
| Filter preparation `column_values` | All values for selected columns (snapshot) | No cap; values returned in full for the session |
| Column values page | 500 per page | Paginated with `has_more` |
| Run details | 1000 per page | Paginated with `has_more` |
| History | 10 entries | Oldest entries pruned |
| Rule list | All rules (unbounded) | No cap |
| Export HTML | No truncation | Complete output |
| Export Excel | No truncation | Complete output |

## 3. Complete server-side result data

The following data must be stored completely server-side and paginated when exposed through API:

| Data | Storage | API exposure |
|------|---------|-------------|
| Comparison row details | Complete in run JSON | Paginated via `/details/?section=changes` |
| Validation violations | Complete in run JSON | Paginated via `/details/?section=violations` |
| Overall metrics | Complete in run JSON | Top-level in run document |
| Per-rule metrics | Complete in run JSON | Top-level in run document |

## 4. Result metrics (always complete, never paginated)

These metrics are always returned in full in the run document (not paginated):

| Metric | Field | Description |
|--------|-------|-------------|
| Total rows A | `result.comparison.total_rows_a` | Rows in file A after filtering |
| Total rows B | `result.comparison.total_rows_b` | Rows in file B after filtering |
| Matched rows | `result.comparison.matched_rows` | Rows with matching keys |
| Rows with changes | `result.comparison.rows_with_changes` | Rows with at least one attribute change |
| Total attribute changes | `result.comparison.total_attribute_changes` | Sum of all attribute changes |
| Total violations | `result.validation.total_violations` | Sum of all rule violations |
| Distinct violating rows | `result.validation.distinct_violating_rows` | Rows violating at least one rule |
| Distinct violating attributes | `result.validation.distinct_violating_attributes` | Distinct (row, column) violations |
| Violations by rule | `result.validation.violations_by_rule` | Per-rule violation lists |
| Violation count by rule | `result.validation.violation_count_by_rule` | Per-rule counts |
| Violating rows by rule | `result.validation.violating_rows_by_rule` | Per-rule distinct row counts |
| Violating attributes by rule | `result.validation.violating_attributes_by_rule` | Per-rule distinct attribute counts |

## 5. 120k x 200 benchmark protocol

### 5.1 Benchmark generator

Generate two CSV files with:
- **120,000 rows** each
- **200 columns** each
- Column types: 50% string, 30% numeric, 10% boolean, 10% null-containing
- Key column: `id` (integer, unique, 1-120000)
- 80% key overlap between files (20% missing in each)
- 15% attribute differences in overlapping rows
- 5% null values in non-key columns
- Column names: `col_001` through `col_200` plus `id`, `name`, `status`

### 5.2 Representative cardinality

| Column type | Unique values | Distribution |
|-------------|---------------|-------------|
| String columns | 100-1000 | Zipfian |
| Numeric columns | Continuous | Normal(mu, sigma) |
| Boolean columns | 2 | 70/30 split |
| Null columns | N/A | 5% null rate |

### 5.3 Measurement

| Metric | Method |
|--------|--------|
| Preparation time | Wall clock from request to response |
| Execution time | Wall clock from execute request to response |
| Peak server memory | `resource.getrusage(RUSAGE_SELF).ru_maxrss` before and after |
| Result size | JSON serialized size of complete result |
| Detail page latency | Time to fetch first page of details |
| Export time | Time to generate complete HTML and Excel exports |

### 5.4 Machine reporting

Record and report:
- OS and version
- Python version
- Polars version
- Available RAM
- CPU cores
- Disk type (SSD/HDD)

### 5.5 Pass/fail criteria

Since hardware-independent limits are not achievable, the benchmark establishes a **baseline**:

| Metric | Baseline requirement |
|--------|---------------------|
| Preparation time | Record baseline; no unbounded scans |
| Execution time | Record baseline; must complete in reasonable time |
| Peak memory | Must not exceed 2x the input file size |
| Result JSON size | Must be paginated; top-level document < 1 MB |
| Detail page latency | First page < 2s on baseline machine |
| Export completeness | No silent truncation |

The benchmark must be **reproducible** and the results committed as test evidence. The generator
script must be checked into `tests/benchmarks/`.

## 6. Unbounded behavior prohibition

The following patterns are **prohibited**:

1. Returning all detail records in a single API response for large results.
2. Materializing both complete CSV files twice (once for preparation, once for execution).
3. Returning all distinct values for all columns in a single response without pagination.
4. Storing unbounded JSON payloads in run persistence without pagination.
5. Silently truncating exports without user notification.

## 7. Ownership

| Component | Owner |
|-----------|-------|
| Column values pagination endpoint | Worker A — `apps/files/` |
| Run details pagination endpoint | Worker A — `apps/runs/` |
| Paginated detail UI integration | Worker B — `PaginatedDetailSection` |
| On-demand value loading | Worker B — `useColumnValues` hook |
| Benchmark generator script | Worker A — `tests/benchmarks/` |
| Benchmark execution and documentation | Worker A |
| Browser memory validation | Worker B — against real endpoints |
