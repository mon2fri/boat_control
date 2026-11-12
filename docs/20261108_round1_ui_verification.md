# Round 1 — user UI verification guide

## Status

**READY FOR USER UI VALIDATION.** Round 1 is integrated and independently
verified (backend export reopened as a real XLSX, frontend regressions, and
headless Chrome against the rebuilt production bundle). The numbered manual
acceptance below is still **your** step; the browser evidence recorded here
covers only the listed interactions and does not substitute for it.

Review record: `reviews/20261108_round1_integration_review.md`.
Fix record: `docs/20261108_round1_integration_fixes.md`.

## Current server status

| Server | Status | Notes |
| --- | --- | --- |
| `http://127.0.0.1:45303/` (`trigger.py`, standard checkout settings) | **Running — left untouched by the reviewer.** | It serves the rebuilt bundle from disk: `assets/index-Blsa1AJ5.js` (HTTP 200). It was not stopped or restarted. |
| `http://127.0.0.1:45306/` (isolated review home) | Stopped by the reviewer after the checks. | Reviewer-only storage under `/tmp/opencode/round1-review/app`. |
| `http://127.0.0.1:45307/` (isolated review home) | Stopped by the reviewer after the checks. | Reviewer-only storage under `/tmp/opencode/round1-review/app2`. |

Your active catalog, uploads, saved-run history and commentary were not
mutated: all reproductions used copies under `/tmp/opencode/`.

### If the page looks stale

The bundle is rebuilt, so a normal reload is not enough — the old hashed
asset name is cached by the browser. Hard-refresh:

- Chrome/Edge: `Ctrl+Shift+R`
- Firefox: `Ctrl+Shift+R`
- Or open a private/incognito window.

Confirm the new bundle is live by viewing the page source and checking that
`index.html` references `assets/index-Blsa1AJ5.js`. If the running server
still serves the old name, restart it (see below) — the bundle files are read
from disk on each request, so a restart is only needed if the server was
started before the rebuild and caches the directory listing.

## Which server should I use?

Use **http://127.0.0.1:45303/** — that is your running app with your active
catalog, configs, uploads and history. The round 1 changes are already in that
bundle.

If you prefer a completely isolated copy (no risk to the active catalog), use
the reviewer's isolated home instead:

```bash
cd /home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/integration
export GROUPED_VALIDATION_HOME=/tmp/opencode/round1-review/app2
export PYTHONPATH="$PWD/backend"
uv run python backend/manage.py migrate \
  --settings=boat_control.grouped_validation_settings --noinput
uv run python backend/manage.py migrate_rules_to_db \
  --settings=boat_control.grouped_validation_settings
uv run python backend/manage.py runserver 127.0.0.1:45307 \
  --settings=boat_control.grouped_validation_settings --noreload
```

That home contains copies of your current `config/` tree and the two root CSVs
(`baseline.csv`, `candidate.csv`). It does **not** contain your active
`data/db.sqlite3` history.

Stop an isolated server with `Ctrl+C` in its terminal, or:

```bash
ps -eo pid,ppid,args | grep '[m]anage.py runserver 127.0.0.1:45307'
kill <the listed PIDs>
```

Do not stop the `trigger.py` server on `127.0.0.1:45303` unless you intend to.

## Fixtures used

- Root CSVs (the ones with `sa_flag` / `cva_flag` / `system`):
  `/home/zwj808/PycharmProjects/boat_control/baseline.csv` and
  `.../candidate.csv` (also already uploaded in your app under `data/uploads/`).
- Rule config `outcome_groups` (R079, four outcomes, root OR over two AND
  groups).
- Rows-and-columns configs `s35` (nested filter grouping), `filter_logic_grouping`,
  `ui-flags-*`, `ui-flags-filter-eq/-neq/-contains/-ncontains`,
  `ui-flags-active-systems`, `ui-flags-all-rows`, `ui-flags-all-checks`,
  `ui-flags-opposite-only`.
- Rule configs `rules`, `catch-all-rules` (legacy single outcome),
  `ui-flags-opposite-only`, `ui-flags-all-checks`, `ui-before-flag-tests`.

## Important note before you test `s35`

Your current `config/rows_and_columns/s35.yaml` points filter rows 2 and 3 at
the **column family** `Test` (`name`, `status`):

```yaml
- column: { kind: column_family, name: Test }
  operator: equals
  filter_values: [ active ]
```

The saved-config loader resolves a family filter to the **first member only**
(`name`), so the run actually applies `name equals "active"`, which selects
nothing. This is pre-existing behaviour (unchanged by round 1) and it makes the
S35 population empty, so R079 reports 0 violations.

**Workaround for a meaningful test:** change those two rows to the concrete
column `status` (and keep the grouping tree `AND(c0, OR(c1,c2))`). With
`status` the same nested expression selects the `oomber` rows and R079 reports
14 violations. The reviewer used exactly that variant in the isolated home.

## Numbered acceptance steps

### 1. Free-text filter value (Bug 1)

1. Upload `baseline.csv` and `candidate.csv`; click **Inspect headers**.
2. Pick `id` (and `name`) as identifier columns; **Continue to compare &
   validate**.
3. Expand **Row filters**, add a filter row, choose column `system`, operator
   **contains**.
4. Type a value that is **not** in the CSV suggestion list — for example
   `Bloomberg` — and press **Enter**.
   - Expected: the value is accepted and appears as a selected chip, exactly
     like an enumerated value. The picker placeholder reads
     “Search or type values…”.
5. Click **Save to new config**, name it e.g. `freetext-check`, **Save**.
   - Expected: the new config appears in the selector and the saved YAML
     contains the typed value in `filter_values`.
6. Reload that config.
   - Expected: the typed value is still present.

### 2. Hierarchical filter hint and FILTER labels (Enhancements 1 and 2)

1. With three filters and a custom grouping tree loaded (for example
   `filter_logic_grouping`), expand **Row filters**.
   - Expected: the hint block reads like
     `overall: filter 1 AND group 1` / `group 1: filter 2 OR filter 3`.
     The overall root line is always shown.
   - Expected: every row shows a visible `FILTER 1`, `FILTER 2`, `FILTER 3`
     label at the left of the row.

### 3. Hint icons (Enhancement 4)

1. Look at the **Row filters** title: the explanatory paragraph is gone and a
   small round **!** icon sits next to the title.
2. Hover the icon, then click it and press `Tab` until it has focus.
   - Expected: the same hint text appears on hover **and** on keyboard focus.
3. Repeat for the **Filter groups**, **Condition groups** and **Outcome
   groups** titles (the last two appear inside the rule editor).
   - Expected: validation errors remain visible as text; only the explanatory
     hints are hidden behind the icon.

### 4. Remove all groups for filters (Enhancement 3)

1. In **Row filters**, switch the grouping to **CUSTOM GROUPS** and click
   **Remove all groups**.
   - Expected: the grouping selector becomes empty, the **Filter groups**
     tree disappears, and all filter rows and their values are still there.
   - Expected: a blocking message says to choose AND, OR or CUSTOM GROUPS.
2. Click **Run comparison and validation**, then **Run now**.
   - Expected: the run is **blocked**. An alert reads
     “Row filter grouping must choose AND, OR, or a custom grouping expression
     when multiple clauses are configured.” No comparison runs and the
     population is not silently widened to an AND list.
3. Choose **AND** explicitly and run again.
   - Expected: the run proceeds with the flat AND expression.

### 5. Remove all groups for outcomes, and Use Single Outcome removal (Enhancements 3 and 5)

1. In **Validation rules**, click **Edit** on `R079 — UI Flags - opposite Yes No`.
   - Expected: there is **no** “Use single outcome” button anywhere.
2. Click **Remove all groups** under **Outcome groups**.
   - Expected: the four outcomes and their values are unchanged; the grouping
     selector is cleared; the preview still lists all four outcomes.
3. Click **Save rule**.
   - Expected: the save is refused with “Choose AND, OR, or CUSTOM GROUPS to
     combine multiple expected outcomes.” Nothing is persisted.
4. Choose **OR** explicitly and save.
   - Expected: the rule saves with the four outcomes and the flat OR relation.

### 6. R079 hierarchy and nested removal tooltip (Bug 4, Enhancement 6)

1. Open `R079` in the editor.
   - Expected: the outcome hierarchy preview reads
     `overall: group 1 OR group 2` /
     `group 1: outcome 1 AND outcome 2` /
     `group 2: outcome 3 AND outcome 4`.
   - Expected: the group tree shows an overall **Group 3** (OR) containing
     **Group 1** and **Group 2** — the root is no longer hidden.
2. Hover the disabled **Remove group** button on Group 1 and on Group 2.
   - Expected: the tooltip reads
     “This group is part of group 3, please remove group 3 first to remove this
     group.” The **Remove group** button on Group 3 itself stays enabled.
   - Expected: the disabled control can still receive keyboard focus
     (`Tab`), and the tooltip appears on focus.

### 7. Overall Results shows the applied grouping (Bug 2)

1. Load a rows-and-columns config with three filters and the nested tree
   (`filter_logic_grouping`, or your `s35` with the `status` workaround from
   the note above).
2. Select `R079`, run the comparison, and wait for the Results page.
   - Expected: the **Overall result summary** block shows the complete
     expression, for example
     `overall: FILTER 1 AND group 1` / `group 1: FILTER 2 OR FILTER 3`,
     followed by the `FILTER 1: … ; FILTER 2: … ; FILTER 3: …` list.
   - Expected: with no filters the block reads `No filtering rows applied`.
3. Copy the run URL (`/results/<run-id>`), open it in a new tab and refresh.
   - Expected: the same grouping is shown — the summary comes from the saved
     run, not from unsaved editor state.

### 8. Excel download with grouped outcomes (Bug 3)

1. On the Results page of a run that produced R079 violations, click
   **Export Excel**.
   - Expected: the file downloads without an error banner. There must be no
     “Cannot convert {'sa_flag': …} to Excel” message.
2. Open the downloaded `.xlsx`.
   - Expected: the workbook opens without repair prompts and contains an
     `R079` sheet with one row per violation.
   - Expected: the **In Comparison** cell holds readable text such as
     `sa_flag=Yes, cva_flag=Yes`, and missing values are distinguished:
     `sa_flag=(null), cva_flag=Yes`.
   - Expected: no cell shows a Python dictionary (`{'sa_flag': 'Yes', …}`).

### 9. Legacy single outcome still works

1. In **Validation rules**, load the rule config `catch-all-rules`
   (**LOAD CONFIG FOR RULES** → select → **Load config**; confirm
   *Discard and load* if prompted).
   - Expected: `Catch-All Rule by ID` appears and can be opened.
   - Expected: the editor shows the single outcome, no **Outcome groups**
     section and no **Use single outcome** button.
2. Save it unchanged.
   - Expected: the save succeeds and the rule keeps its canonical identifier.

### 10. Regression guard — previously accepted fixes still work

1. Save `R079` unchanged from the editor.
   - Expected: the rule keeps all four outcomes, the OR relation, both AND
     groups and its canonical identifier.
2. Run S35 with `R056` / `R057` (legacy rules) and open the saved run from
   History.
   - Expected: the results render without “Response failed validation”, and
     the saved run restores both rules.
3. Run `ui-flags-filter-eq` and `ui-flags-filter-neq` from
   **LOAD CONFIG FOR ROWS AND COLUMNS** and run the comparison.
   - Expected: the run starts (previously it failed with “The run failed
     unexpectedly” because those configs persist the operator as `eq`/`neq`).

## Browser evidence collected by the reviewer

Headless Chrome (`/usr/bin/google-chrome` via Playwright) against an isolated
server on `127.0.0.1:45307` with the rebuilt bundle. The browser served
`200 /assets/index-Blsa1AJ5.js` and `200 /assets/index-fNqmScvO.css`; no page
errors were reported.

| Step | What the browser showed |
| --- | --- |
| 1 | `Bloomberg` typed into a `contains` row was accepted as a chip and persisted into the saved config YAML. |
| 2 | Rows rendered `FILTER 1/2/3`; hint block `overall: filter 1 AND group 1` / `group 1: filter 2 OR filter 3`. |
| 3 | Hint icon: `role="img"`, `aria-label="Row filters help"`, `tabindex="0"`; tooltip visible on keyboard focus. |
| 4 | Remove all groups kept 3 rows; **0** execute requests; alert “Row filter grouping must choose AND, OR, or a custom grouping expression when multiple clauses are configured.” |
| 5 | No “Use single outcome”; outcome remove-all kept 4 clauses, the save was refused with no PUT request. |
| 6 | Tree test ids `tree-Group 3`, `tree-Group 1`, `tree-Group 2`; `Remove Group 1/2` disabled, `Remove Group 3` enabled; tooltip “This group is part of group 3, please remove group 3 first to remove this group.” |
| 7 | Run request carried `filter_grouping_tree` = `and(c0, or(c1,c2))`; Results showed `overall: FILTER 1 AND group 1` / `group 1: FILTER 2 OR FILTER 3`, also after a `/results/<run-id>` reload. |
| 8 | Downloaded workbook reopened with 7 sheets, 14 R079 rows, 0 dict-valued cells, `sa_flag=Yes, cva_flag=Yes` and `sa_flag=(null), cva_flag=Yes` preserved. |
| 9 | Legacy rule opened and saved unchanged (HTTP 200) with the legacy `logic` payload. |
| 10 | `ui-flags-filter-eq` now runs and emits `{"column":"cva_flag","operator":"eq","filter_values":["Yes"]}`. |

Component/unit evidence (not browser evidence) is in the worker and reviewer
test files listed in the fix record.

## Preserved user files

SHA-256 checksums were captured before the review work and re-verified after
every integrated suite, build and browser run. **All files matched** and none
of them is part of any commit on this branch.

| Preserved file | SHA-256 |
| --- | --- |
| `config/rows_and_columns/s35.yaml` | `34289deeda7dd2e9eaa7f2bfcaa671350f5719ecab50af35f4eee2e33d132433` |
| `config/rules/rules.yaml` | `a4bff77aae65117f21f437315e35efd01777a9c5f0b2012d167a6a1ffabab72c` |
| `config/filters/1c12cde0dd5c.yaml` | `ef0db7d01ab9de2968e0fe7000da59e90ee698d9229f29c598b7309632398f11` |
| `config/rows_and_columns/filter_logic_grouping.yaml` | `9b51a4bff99cb7298437137367d0d9dd25c3492286716abbbaa2abae7728442f` |
| `config/rows_and_columns/ui-flags-active-systems.yaml` | `60c4fdc1178009193914b65734b7192835fbf6f65eb650f4de3894ce1aa150b9` |
| `config/rows_and_columns/ui-flags-all-rows.yaml` | `5c8093723d0d73e2b91169db872538816e7dff3c80ec2c611e02a89f91830fc5` |
| `config/rows_and_columns/ui-flags-filter-contains.yaml` | `848b29afbf46968cdd457c85a81ad63f17a400162bfbf3de3ee3a90ab3ee062c` |
| `config/rows_and_columns/ui-flags-filter-eq.yaml` | `26392f452c1853e9d971d3e9e7b6f0ad393e378aac3111029ff6d18859ba384a` |
| `config/rows_and_columns/ui-flags-filter-ncontains.yaml` | `e43a3a513cc3279a84e7622bd22019575da01c71f19656591e9b1c83d3518f0a` |
| `config/rows_and_columns/ui-flags-filter-neq.yaml` | `a083b79fe25f48b2f9fa556a1312019a993b8c305f3340d362a1ba59526ae089` |
| `config/rules/catch-all-rules.yaml` | `35b9b9db87895a00ec4c2c79380dccf01848587dfbd63a7ee14620f4b501e781` |
| `config/rules/outcome_groups.yaml` | `10a99eb014096445aaf7671f2b52a17da69ec9bf2f530e26f9335769bad78fab` |
| `config/rules/ui-before-flag-tests-active-backup.yaml` | `15f3389aeb9c96bee8b58540bb4a2c40ea66a9c197c3de4ef03c222c30e5eb9b` |
| `config/rules/ui-before-flag-tests.yaml` | `bad2fdd1eb14be83e09a17c401a17c781ed7c9a6dfb4e388abb4a3a49f095ff5` |
| `config/rules/ui-flags-all-checks.yaml` | `5447cbf50db5c3c5e1f9c4849612e7a2340539bafeafdcecd1a9486b0db73106` |
| `config/rules/ui-flags-opposite-only.yaml` | `fb8fec3d7941c24817f4e5c27b2503fa6466fb0ff27838ebd45762a64f005c91` |
| `docs/20261108_root_csv_flag_ui_setup.md` | `b9654b5785aeaab875c16256e71cd76f0bf288544f2fb026d93e33a7e450da66` |
| `data/uploads/2ef6cb16…csv` | `2ef6cb16020676c3053c30f591c72075f473514750e18090ade27fc5cb69199a` |
| `data/uploads/45511c56…csv` | `45511c56f53063c5c24381c4a034de3110c7798340d4ad8979deba75b8a8c1a6` |
| `data/uploads/617510ee…csv` | `617510eef42899eba16b3a0beff4a1a9af44c3d4175b3011d0b3981d949624c9` |
| `data/uploads/7b4a460c…csv` | `7b4a460c6056d216d3ccd908457195907409ed42d367cee61e3f921dfa0a7442` |
| `data/uploads/e7deb25db…csv` | `e7deb25dbfca4261a09e139e96aa61881d6d6174e8ff80f58ac1c8bbd7100aaa` |
| `data/uploads/f247a758…csv` | `f247a7588daf175bc96d5317478cc71e206d952c50aa39363c47e52275bfa4fa` |

## Known limitations to be aware of while testing

1. **Column-family filters** resolve to the first family member (see the note
   above). Your `s35` rows 2–3 therefore select nothing.
2. **New exceptions only** is on by default. A second run in the same app can
   report 0 violations because the exceptions are already stored; uncheck
   **New Exceptions Only** on the Results page to see them again.
3. The hierarchy lines use lower-case leaf labels (`filter 1`, `outcome 1`)
   while the row labels are upper-case (`FILTER 1`, `Outcome 1`). This mirrors
   the pre-existing Outcome Groups wording.
4. The full manual acceptance above is still pending — the reviewer evidence
   covers the listed interactions only.
