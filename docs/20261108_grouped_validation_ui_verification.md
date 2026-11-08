# Grouped validation — user UI verification guide

## Status

**NOT READY for final user acceptance yet.** The integrated code is running and
automated checks/browser smoke are recorded, but worker implementation/delivery
documentation corrections listed in
`docs/20261108_grouped_validation_integration_fixes.md` are still required. The
current isolated app may be used for exploratory/manual verification while that
documentation handoff is pending.

No live books or original-checkout data are used. All app storage is isolated at
`/tmp/opencode/grouped-validation-ui` (database, config, uploads, preparation
cache, run reports and exception tracking).

## Samples and expected loader representation

- `samples/grouped_validation/baseline.csv`
- `samples/grouped_validation/comparison.csv`
- `samples/grouped_validation/legacy_rules.yaml`
- `samples/grouped_validation/README.md`

In this environment, Polars CSV loading represents row 6's unquoted empty
`CVA` field as `None` and row 15's quoted empty field as `""`. Row 14 contains
literal whitespace in `SA`. Verify locally with:

```bash
GROUPED_VALIDATION_HOME=/tmp/opencode/grouped-validation-ui \
PYTHONPATH=backend uv run python - <<'PY'
import polars as pl
frame = pl.read_csv("samples/grouped_validation/comparison.csv", infer_schema_length=0)
print(frame.filter(pl.col("ID").is_in(["6", "14", "15"])).select("ID", "SA", "CVA"))
PY
```

The evaluator tests independently exercise both Python `None` and empty string
for all four operators, so the UI sample is not the only evidence for blank
semantics.

## Exact isolated setup and startup

Run from the integration worktree:

```bash
cd /home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/integration
export GROUPED_VALIDATION_HOME=/tmp/opencode/grouped-validation-ui
export PYTHONPATH="$PWD/backend"
mkdir -p "$GROUPED_VALIDATION_HOME/config/rules"
cp samples/grouped_validation/legacy_rules.yaml \
  "$GROUPED_VALIDATION_HOME/config/rules/rules.yaml"
uv run python backend/manage.py migrate \
  --settings=boat_control.grouped_validation_settings --noinput
uv run python backend/manage.py migrate_rules_to_db \
  --settings=boat_control.grouped_validation_settings
```

Start the backend in terminal 1:

```bash
GROUPED_VALIDATION_HOME=/tmp/opencode/grouped-validation-ui \
PYTHONPATH=backend uv run python backend/manage.py runserver \
  127.0.0.1:8000 --settings=boat_control.grouped_validation_settings
```

Start the frontend in terminal 2:

```bash
npm --prefix frontend run dev -- --host 127.0.0.1 --port 5173
```

Open **http://127.0.0.1:5173/**. The Vite development server proxies `/api`
to **http://127.0.0.1:8000**. Use the same `GROUPED_VALIDATION_HOME` on every
backend restart to restore the same isolated catalog and saved run history.
The regular `scripts/dev.sh` uses the standard checkout settings, so do not use
it for this isolated verification.

## Numbered acceptance steps

1. **Upload the sample population.** Upload `baseline.csv` and
   `comparison.csv`; click **Inspect headers**. In **Identifier columns**, pick
   `ID`, then click **Continue to compare & validate**.

2. **Build the nested population filter.** Expand **Row filters** and add five
   rows, each using **equals**:
   - F1: `BOOK_TYPE = MO`
   - F2: `SYSTEM = Traded Risk`
   - F3: `BOOK_TYPE = FO`
   - F4: `STATUS = Active`
   - F5: `RG_REGION = Asia Pacific`

   Select **CUSTOM GROUPS**. Create groups using the **Create new group**
   controls:
   - Group 1: AND over F1 and F2.
   - Group 2: OR over Group 1 and F3 (select the existing group and F3 to nest
     Group 1).
   - Group 3: AND over Group 2 and F4.
   - Group 4: AND over Group 3 and F5.

   The preview must be equivalent to
   `(((F1 AND F2) OR F3) AND F4) AND F5`. All five leaves must appear exactly
   once. Changing a row's column/value, removing/reordering a row, or removing a
   referenced clause must show a repair error; it must not change the run into
   an unrestricted or differently grouped population.

3. **Check population truth/count.** The filter selects 11 comparison records:
   IDs `1, 2, 3, 4, 5, 6, 8, 9, 10, 14, 15`. IDs 7 and 11 are inactive, ID 12
   is MO with a different system, and ID 13 is FO outside Asia Pacific. The
   integrated backend sample check independently returned exactly those IDs.

4. **Save and reload filter/config state.** Save a new rows-and-columns config.
   Restart the isolated backend without changing its home path, load that
   config, and verify the same filter rows, relation/tree preview, and selected
   population. A config with an incomplete/invalid tree must refuse save/load or
   show a blocking repair message.

5. **Create the compound outcome rule.** In Validation rules, add a
   value-against-column rule with four outcomes in order:
   `SA = Y`, `CVA = N`, `SA = N`, `CVA = Y`. Choose **CUSTOM GROUPS** and create
   two AND groups, outcomes 1+2 and outcomes 3+4. Leave the editor's two groups
   joined by OR. The preview must read:

   ```text
   (SA = Y AND CVA = N) OR (SA = N AND CVA = Y)
   ```

   Save the rule. Also configure and inspect a simple OR rule (`SA=Y OR CVA=Y`)
   and simple AND rule (`SA=N AND CVA=N`) if desired.

6. **Run and verify the opposite-flags truth table.** Select only the compound
   grouped rule, run with the filter from step 2, and check the eight violations
   are IDs `3, 4, 5, 6, 9, 10, 14, 15`. Three records pass: IDs `1, 2, 8`.
   Y/N and N/Y pass. Y/Y, N/N, invalid text, null, empty string and whitespace
   are violations. The exact integrated sample evaluator returned 11 selected,
   3 passing, and 8 violating records.

7. **Check null/blank negative semantics.** In Row Filters, test equals/contains
   versus not-equals/not-contains against rows 6 (null `CVA`) and 15 (empty
   `CVA`); positives exclude and negatives include those rows. Repeat in a Rule
   Condition (rule applicability) and in a Rule Logic outcome (required-state
   pass/fail). In particular, `CVA != Y` is satisfied by null/empty; `CVA = Y`
   is not. Whitespace-only row 14 stays a literal nonblank string and is not
   trimmed.

8. **Exercise rule/config lifecycle and restoration.** Save the grouped rule in
   a rules config, export/import it, reload it, and verify all four clauses and
   both AND groups remain unchanged. Restore the saved run from History (including
   a refreshed `/results/<run-id>` URL); the same filter tree and run metadata
   must return, and an invalid restored reference must block rerun.

9. **Verify legacy compatibility and editor repair.** Open the seeded `R001`
   legacy single-outcome column-against-column rule. Confirm the mode remains
   editable and its canonical identifier remains unchanged. Create/edit one
   simple legacy rule and compare its ID before/after unchanged content. Try
   removing/reordering a grouped clause, switching custom/flat modes, and
   switching into/out of column-comparison mode; no outcome may be silently
   replaced by the first clause.

10. **Inspect compound exception/report/tracking detail.** A grouped failure
    should produce one violation per rule/key, not one per failed clause. Verify
    detail exposes both `SA` and `CVA` with observed values and the complete rule
    expression. Export HTML and Excel and inspect the same columns/values. Check
    exception tracking has one stable occurrence for that rule/key.

## Browser evidence and current processes

- Real-browser smoke used `@playwright/test` with `/usr/bin/google-chrome` in
  headless mode. It uploaded both sample CSVs, selected `ID`, entered Prepare,
  added two filters, selected CUSTOM GROUPS, created an AND group, and reported
  no page errors. This is a smoke test, **not** completion of the numbered user
  acceptance above.
- The browser smoke exposed and verified the fix for an invalid-config render
  crash: incomplete filters now leave the page usable, show errors, and disable
  config saving.
- The isolated backend and Vite server are deliberately left running for this
  manual handoff. At last check: backend listener process tree rooted at PID
  `78466` (`runserver 127.0.0.1:8000`, children `78469`/`78477`); frontend Vite
  PID `78553` (`127.0.0.1:5173`). PIDs can change after restart. Stop each
  foreground process with Ctrl+C, or inspect exact PIDs with:

  ```bash
  ps -eo pid,ppid,args | grep -E '[m]anage.py runserver 127.0.0.1:8000|[v]ite --host 127.0.0.1 --port 5173'
  ```

  Then send `TERM` only to those listed process PIDs. Do not stop unrelated
  services. All app state is under `/tmp/opencode/grouped-validation-ui`.
