# UI Workflows

How each screen behaves, its states, and its validation messages. Screens appear in workflow
order. Terminology matches `requirements/20260717_initial_requirement.md`.

## 1. Upload & header review (`/`)

### Source modes

- **Upload files** — two file inputs (`.csv`). The baseline file is first, the candidate second.
  Selected file names are shown back to the user as inert text.
- **Preset network source** — choose a configured source, then name the two files to load from it.

### States

| State     | Trigger                       | UI                                                                 |
| --------- | ----------------------------- | ------------------------------------------------------------------ |
| Idle      | Initial / after cancel        | Source form enabled, submit disabled until both inputs are present |
| Loading   | Submit                        | `aria-live` "Inspecting headers…" with a **Cancel** button         |
| Error     | Request failed / API error    | `role="alert"` message with the server-provided detail             |
| Success   | Header report returned        | Header review section + "Continue to filters & targets"            |

Cancellation aborts the in-flight request via `AbortController` and returns to Idle without an
error. Starting a new request while one is running aborts the previous one.

### Header review

- Shows counts of **shared** columns and columns **only in** each file.
- A warning banner appears when the files differ, naming how many columns are unique to each file.
- Only shared columns proceed to comparison/validation; a files-share-no-columns state blocks
  continuation with an explanatory error.
- Column names come from untrusted files and are rendered as text; long lists are filterable via a
  search box rather than truncated.

## 2. Filters & targets (`/prepare`)

### Filters

- Each row is `{column} {operator} {value}`; one condition per row. Rows combine with logical AND.
- **Column** and **value** use the searchable combobox. Operators: *equals to, not equal to,
  contains, not contains*.
- Values are loaded for the chosen column and carry a star (`*`) marker when present in only one
  file. Starred values are announced as disabled and cannot be selected.
- Rows are added with **+ Add filter** and removed individually. An empty list is allowed.

### Targets

- Add target columns one at a time via the searchable dropdown (already-selected columns are
  excluded, preventing duplicates), or paste a comma-separated list and press **Validate & add**.
- Validation reports any names that are not common columns; valid names are added as removable chips.
- An empty target selection means "compare all common columns".

### Full-set confirmation (2,000-row boundary)

- Confirmation is required only when there are **no filters** and the combined row count is **>=**
  the threshold (default 2,000, configurable in settings). Below the threshold, the run proceeds
  without prompting.
- A warning explains the pending confirmation; **Continue to rules** opens an `alertdialog` that
  must be confirmed. The acknowledgement is stored on the run request (`confirmFullSet`).

## 3. Validation rules (`/rules`)

### Selecting rules for a run

- Rules load from config; all are selected by default. Toggle checkboxes to deselect. Newly created
  rules are auto-selected. The selection is stored in the workflow and sent with the run.
- **Continue to run** proceeds to the result page (enabled once files are uploaded).

### Configuring rules (create / edit / delete)

- **Add rule** / **Edit** open the rule editor. **Delete** requires confirmation and cannot be undone.
- The server assigns each saved rule an auto-incrementing identifier `Rxxx` (e.g. `R001`), shown in
  the list and the editor heading.

### Rule editor

- **Name** (required) and **Description** (optional).
- **Conditions (optional)** — rows of `{column} {operator} {value}`, added via **+ Add condition**.
  - With **more than one** condition, choosing **AND**/**OR** is mandatory.
  - With **three or more** conditions, an optional **grouping** expression (e.g. `(1 AND 2) OR 3`)
    can override the uniform join.
- **Logic (required)** — pick a format:
  - **Value against column**: `{column} {operator} {value}` (free-form value covers the "Others" case).
  - **Column against column**: `{column} {operator} {compared column}`.
- Column fields use the searchable combobox when an upload session provides common columns, and
  degrade to a text input when authoring rules without a session.
- Invalid submissions list every problem inline. Cancelling with unsaved edits prompts to discard.

### Rule authoring examples

- **Simple**: no conditions, logic `status equals "active"` — every row's `status` must equal
  `active`.
- **Conditional**: condition `country equals "US"`, logic `tax_id not equals ""` — US rows must have
  a tax id.
- **Grouped**: conditions `a equals 1`, `b equals 2`, `c equals 3` with grouping `(1 AND 2) OR 3`.

## 4. Run & results (`/results`)

### Running

- The run panel summarizes the pending run (filter count, target scope, selected rule count) and a
  **Run now** button. While running it shows an `aria-live` status with a **Cancel** button.
- On failure a `role="alert"` shows the server message; the panel stays so the run can be retried.

### Result terminology

The overall summary shows the five required counts:

| Metric                        | Meaning                                                   |
| ----------------------------- | --------------------------------------------------------- |
| Records loaded                | Rows read after filtering                                 |
| Rows violating a rule         | Distinct rows that break at least one selected rule       |
| Attributes violating a rule   | Distinct (row, column) cells that break a rule            |
| Rows with changes             | Distinct rows whose values differ between the two files   |
| Attributes changed            | Distinct (row, column) cells that differ                  |

### Layout & navigation

- A sticky **floating table of contents** links to the overall result, the attribute-changes
  section, and every rule section via in-page anchors (keyboard/screen-reader friendly).
- Each section shows its comparison logic (or rule logic) directly under the title.
- Detail tables are **virtualized** — only the visible window is materialized, so 120k-row results
  stay responsive. The layout collapses to a single column on narrow viewports.

### States

- **Loading**: run in progress (cancelable). **Zero**: sections render with empty-state "No detail
  rows." **Error**: alert with the failure reason and a retry path.

## 5. Report naming, history & export

### Naming & rename

- The default report name is `{file1}_vs_{file2}` (extensions stripped), assigned by the backend.
- **Double-click** the name (or the pencil button) to edit inline. **Enter** saves, **Escape**
  cancels. The rename request updates the current result.
- Names are validated client-side before sending: non-empty, ≤120 chars, and free of path
  separators (`/ \`), reserved characters (`: * ? " < > |`), `.`/`..`, and control characters.
  Invalid names disable **Save** and show the reason. The backend re-sanitizes authoritatively.

### History (ten-run retention)

- `/history` lists the most recent runs (backend keeps up to ten), most recent first.
- **Load** fetches a run's saved JSON and shows it on the results page. Empty and load-failure
  states are handled explicitly (e.g. a stale/missing run reports "Could not load that run").

### Export

- **Export HTML** and **Export Excel** are same-origin downloads,
  driven by anchor navigation with the `download` attribute — no scripted fetch, no external host.
- Escaping and spreadsheet-formula-injection mitigation are performed by the backend exporter.
