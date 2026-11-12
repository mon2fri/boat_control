# Grouped validation sample data

Use `baseline.csv` and `comparison.csv` only in the isolated integration app.
They contain no live books. Row 14's `SA` field is whitespace-only; it is
intentionally literal and is not a valid Y/N flag. With this application's
Polars CSV loader, row 6's unquoted empty `CVA` is `None` and row 15's quoted
empty `CVA` is `""`. The evaluator regression suite also tests Python `None`
and the empty string directly, independent of CSV ingestion.

For the overall population filter use these five clauses:

1. `BOOK_TYPE = MO` (`F1`)
2. `SYSTEM = Traded Risk` (`F2`)
3. `BOOK_TYPE = FO` (`F3`)
4. `STATUS = Active` (`F4`)
5. `RG_REGION = Asia Pacific` (`F5`)

Group the first two with AND, OR that group with F3, then AND F4 and F5:

```text
((F1 AND F2) OR F3) AND F4 AND F5
```

The selected comparison population is 11 records: IDs `1–6`, `8–10`, and
`14–15`. IDs 7 and 11 are inactive, ID 12 is an alternative MO population,
and ID 13 is outside Asia Pacific.

Create a value-against-column rule with four outcomes:

```text
(SA = Y AND CVA = N) OR (SA = N AND CVA = Y)
```

Only IDs 1, 2, and 8 pass. IDs 3, 4, 5, 6, 9, 10, 14, and 15 violate (8
records), including equal flags, invalid text, blank, and whitespace-only text.
`legacy_rules.yaml` supplies a single column-against-column rule for checking
the existing mode; it is not part of the grouped-outcome count unless selected.
