# Run Persistence API

## Endpoints

### `GET /api/runs/`

Lists all saved runs in reverse chronological order.

**Response (200):**
```json
[
  {
    "run_id": "abc123def456",
    "report_name": "file_a_vs_file_b",
    "file_a_name": "file_a.csv",
    "file_b_name": "file_b.csv",
    "created_at": "2026-07-18T12:00:00+00:00",
    "as_of_date": "2026-06-30",
    "file_path": "/path/to/results/abc123def456_file_a_vs_file_b.json"
  }
]
```

`as_of_date` is the ISO calendar date used for exception tracking. It is `null`
for historical runs created before exception tracking; those runs remain
readable and are never retroactively tracked.

### `GET /api/runs/<run_id>/`

Loads a specific run's full result data.

**Response (200):** Full execution result JSON. New documents include a top-level
`as_of_date` string (or `null` when a direct caller did not supply one). The
Exception Tracking workbook download resolves this field by `run_id`.

New result documents persist a `rule_bindings` map from each run-local `Rxxx` to
its canonical `CBR1_...` identifier, plus `rule_identifier` on violations and rule
summaries. These values are snapshots from execution and do not follow later catalog
edits. Old documents without identifiers remain readable without identity guessing;
their unavailable identifiers are absent/null according to the wire contract.

### `PUT /api/runs/<run_id>/rename/`

Renames a run's report name.

**Request:**
```json
{"report_name": "New Report Name"}
```

**Response (200):** Updated metadata.

## Auto-Naming

- Default format: `{file1_stem}_vs_{file2_stem}`
- Example: `data_v2_vs_data_v3` from `data_v2.csv` and `data_v3.csv`

## Report Name Sanitization

- Non-alphanumeric characters replaced with `_`
- Maximum length: 200 characters
- Empty names default to `unnamed_run`

## Retention Policy

- Maximum 10 runs retained
- Oldest runs deleted first when limit exceeded
- Deletion removes both JSON file and index entry

## File Structure

```text
data/results/
├── index.json                    # Metadata index
├── abc123_run1.json              # Run result files
├── def456_run2.json
└── ...
```

## Atomicity

- All writes use temporary files + rename
- Index and result files written atomically
- Prevents corruption from interrupted writes
