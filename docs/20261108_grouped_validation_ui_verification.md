# Grouped validation — user UI verification guide

## Status

**READY FOR USER UI VALIDATION.** The worker implementation/delivery records now
document the integration findings and reviewer-authored fixes. The full numbered
visual acceptance remains pending user execution; the limited browser smoke does
not substitute for it.

No live books or original-checkout data are used. All app storage is isolated at
`/tmp/opencode/grouped-validation-main-configs` (database, config, uploads,
preparation cache, run reports and exception tracking). Config files were copied
from tracked Git objects on local `main` (`6b4bc94`); `origin/main` (`14d984b`)
has the same tracked `config/` tree. No main code was merged and no
checkout-local config/data was copied.

## Samples and expected loader representation

- `samples/grouped_validation/baseline.csv`
- `samples/grouped_validation/comparison.csv`
- `samples/grouped_validation/legacy_rules.yaml`
- `samples/grouped_validation/README.md`

In this environment, Polars CSV loading represents row 6's unquoted empty
`CVA` field as `None` and row 15's quoted empty field as `""`. Row 14 contains
literal whitespace in `SA`. Verify locally with:

```bash
GROUPED_VALIDATION_HOME=/tmp/opencode/grouped-validation-main-configs \
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
export GROUPED_VALIDATION_HOME=/tmp/opencode/grouped-validation-main-configs
export PYTHONPATH="$PWD/backend"
mkdir -p "$GROUPED_VALIDATION_HOME"
git archive main config | tar -x -C "$GROUPED_VALIDATION_HOME"
cp samples/grouped_validation/legacy_rules.yaml \
  "$GROUPED_VALIDATION_HOME/config/rules/grouped_validation_legacy_sample.yaml"
uv run python backend/manage.py migrate \
  --settings=boat_control.grouped_validation_settings --noinput
uv run python backend/manage.py migrate_rules_to_db \
  --settings=boat_control.grouped_validation_settings
```

This setup copies the 15 tracked `config/` files from `main` and adds the
separate legacy column-comparison sample config. `migrate_rules_to_db` reported
2 imported main-branch catalog rules (`R056`, `R057`). The copied rows/columns
configs (`s34`, `s35`), filters, family, and rule configs are available alongside
the grouped-validation sample. Do not rerun `git archive` over a home containing
user edits; choose a fresh dedicated home for a clean reset.

Start the backend in terminal 1:

```bash
GROUPED_VALIDATION_HOME=/tmp/opencode/grouped-validation-main-configs \
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
it for this isolated verification. `trigger.py` is also a prebuilt-release
launcher: it hardcodes `boat_control.settings` and reads the project-root `.config`.
Running it from the integration root would not use
`/tmp/opencode/grouped-validation-main-configs`; running it from the original
checkout serves that checkout's bundle/config instead. Use the two isolated
commands above for this UI validation.

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

9. **Verify legacy compatibility and editor repair.** Open main-branch rules
   `R056` (Valid status) and `R057` (Low Score) and confirm their legacy
   single-outcome shapes load. Load the separate
   `grouped_validation_legacy_sample` rules config to inspect column-against-
   column mode. Confirm it remains editable and its canonical identifier remains
   unchanged across an unchanged save. Try removing/reordering a grouped clause,
   switching custom/flat modes, and switching into/out of column-comparison mode;
   no outcome may be silently replaced by the first clause.

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
- The isolated backend/Vite servers and the subsequently started `trigger.py`
  server were stopped at the user's request. Ports 8000, 5173 and 45303 are not
  listening. To stop processes after a future start, press Ctrl+C in each
  foreground server terminal, or inspect exact PIDs with:

  ```bash
  ps -eo pid,ppid,args | grep -E '[m]anage.py runserver 127.0.0.1:8000|[v]ite --host 127.0.0.1 --port 5173'
  ```

  Then send `TERM` only to those listed process PIDs. Do not stop unrelated
  services. All app state is under `/tmp/opencode/grouped-validation-main-configs`.

## User-reported R079/S35 follow-up verification

The follow-up fixes are integrated at `d2b9f46` (Worker C S35 response-schema
fix), `1ca1dcf` (Worker D R079 editor fix), with regressions at `077f2c7` and
the implementation/delivery documentation at `f66f0ad` and `98d559c`. The final
review record has the original worker hashes, causes and full validation ledger.

### Isolated reproduction and results

No active catalog, uploads or saved-run history were used. The current user S35
configuration, R079 rule catalog, and two upload CSVs were copied into fresh
homes under `/tmp/opencode/`. Backend execution and frontend response validation
were checked separately:

- R079 catalog GET → unchanged PUT → GET returned `200/200/200`; the identifier
  remained `CBR1_1FB1N7BHJ3WTCD3BB1KW`, with four outcome clauses, relation OR,
  and both AND groups. The frontend catalog mapper/editor and outbound payload
  were verified against this saved response.
- S35 executed with R056/R057 and returned `200`; saved-run GET also returned
  `200`. It included `filter_relation: null` and
  `filter_grouping_tree: null`, nested aggregation and two comparison sections.
  The actual saved response passed the frontend schema, mapping and workflow
  restoration checks. The bug was the frontend rejecting the backend's explicit
  null grouping fields after a successful run; the schema now accepts only this
  nullable no-grouping case and retains strict validation for malformed
  non-null values.
- Chrome/Playwright used the rebuilt production bundle at the isolated server
  `http://127.0.0.1:45305/`. It verified R079 preview/save/payload/catalog
  reload, ran S35 with R056/R057, rendered results without
  “Response failed validation,” and restored both rules from
  `/results/16d1fa15d923`. Assets returned HTTP 200 were
  `index-B3FO4Ouy.js` and `index-Cp-9jp4Y.css`; there were no browser page
  errors. The isolated `:45305` server was stopped after the check.

**Remaining limitation:** A violating grouped R079 backend run returns an
object-valued `violating_value` such as `{"sa_flag":"Yes","cva_flag":"Yes"}`.
The frontend still declares this field scalar and rejects that separate
response. Worker B supplied no follow-up fix. R079 save/load and S35/R056/R057
are verified; rendering violations from a grouped R079 run is not. Do not use a
violating R079 run for UI acceptance until that response contract is addressed.

### Production-bundle app retest

The user's request stopped the server previously listening at
`127.0.0.1:45304` (PIDs 195758 and 195761). The isolated browser server on
`:45305` was also stopped. **There is currently no app URL serving the bundle.**
The rebuilt tracked `frontend/dist` is present. To restart the same isolated
backend home/database and use the production bundle served by Django, run from
the integration worktree root:

```bash
cd /home/zwj808/PycharmProjects/boat_control-worktrees/grouped-validation/integration
GROUPED_VALIDATION_HOME=/tmp/opencode/grouped-validation-ui-retest \
PYTHONPATH=backend uv run python backend/manage.py runserver \
  127.0.0.1:45304 --settings=boat_control.grouped_validation_settings --noreload
```

Then open **http://127.0.0.1:45304/** and hard-refresh (`Ctrl+Shift+R`) to load
the rebuilt `index-B3FO4Ouy.js`. This home contains isolated copies of the
current S35/R079-related configs, R056/R057 and copied CSVs; it is not the
original checkout or its active history. For the S35 retest, load S35, select
R056 and R057, run, then open the saved run from History or refresh its
`/results/<run-id>` URL. For R079, first verify the four-outcome custom grouping
preview and unchanged save/reload. Do not execute a violating R079 rule until
the object-valued response limitation is fixed.

### User config and CSV preservation evidence

SHA-256 checksums matched before and after isolated reproduction/build/browser
verification. The modified S35 and rules files, new UI flag configs/backups,
setup doc, and source CSV uploads remain local and are excluded from fix commits.

| Preserved file | SHA-256 |
| --- | --- |
| `config/rows_and_columns/s35.yaml` | `c70de7270f727d7d2ca55b927afe8a1686b43630accc9b9d22115b7502c4935f` |
| `config/rules/rules.yaml` | `a4bff77aae65117f21f437315e35efd01777a9c5f0b2012d167a6a1ffabab72c` |
| `config/filters/1c12cde0dd5c.yaml` | `ef0db7d01ab9de2968e0fe7000da59e90ee698d9229f29c598b7309632398f11` |
| `config/rows_and_columns/ui-flags-active-systems.yaml` | `60c4fdc1178009193914b65734b7192835fbf6f65eb650f4de3894ce1aa150b9` |
| `config/rows_and_columns/ui-flags-all-rows.yaml` | `5c8093723d0d73e2b91169db872538816e7dff3c80ec2c611e02a89f91830fc5` |
| `config/rows_and_columns/ui-flags-filter-contains.yaml` | `848b29afbf46968cdd457c85a81ad63f17a400162bfbf3de3ee3a90ab3ee062c` |
| `config/rows_and_columns/ui-flags-filter-eq.yaml` | `26392f452c1853e9d971d3e9e7b6f0ad393e378aac3111029ff6d18859ba384a` |
| `config/rows_and_columns/ui-flags-filter-ncontains.yaml` | `e43a3a513cc3279a84e7622bd22019575da01c71f19656591e9b1c83d3518f0a` |
| `config/rows_and_columns/ui-flags-filter-neq.yaml` | `a083b79fe25f48b2f9fa556a1312019a993b8c305f3340d362a1ba59526ae089` |
| `config/rules/ui-before-flag-tests-active-backup.yaml` | `15f3389aeb9c96bee8b58540bb4a2c40ea66a9c197c3de4ef03c222c30e5eb9b` |
| `config/rules/ui-before-flag-tests.yaml` | `bad2fdd1eb14be83e09a17c401a17c781ed7c9a6dfb4e388abb4a3a49f095ff5` |
| `config/rules/ui-flags-all-checks.yaml` | `5447cbf50db5c3c5e1f9c4849612e7a2340539bafeafdcecd1a9486b0db73106` |
| `config/rules/ui-flags-opposite-only.yaml` | `fb8fec3d7941c24817f4e5c27b2503fa6466fb0ff27838ebd45762a64f005c91` |
| `docs/20261108_root_csv_flag_ui_setup.md` | `b9654b5785aeaab875c16256e71cd76f0bf288544f2fb026d93e33a7e450da66` |
| `data/uploads/617510eef42899eba16b3a0beff4a1a9af44c3d4175b3011d0b3981d949624c9.csv` | `617510eef42899eba16b3a0beff4a1a9af44c3d4175b3011d0b3981d949624c9` |
| `data/uploads/e7deb25dbfca4261a09e139e96aa61881d6d6174e8ff80f58ac1c8bbd7100aaa.csv` | `e7deb25dbfca4261a09e139e96aa61881d6d6174e8ff80f58ac1c8bbd7100aaa` |

Final follow-up gates: targeted frontend actual-response/editor/mapping tests **42
passed**, full frontend **606 passed / 2 skipped**, targeted backend **137
passed**, TypeScript and production build passed, and `git diff --check` passed.
