# User UI acceptance — rule evolution

The integrator supplies the integration branch/path, runnable isolated preview,
seeded synthetic CSVs, and checks already run. These steps are for the user;
automated smoke checks do not count as user acceptance.

## Main scenario

1. Inspect September 30's v1 exception and its existing commentary. Note its
   canonical rule identifier and literal exception ID.
2. Inspect the configuration history: an October 15 modify-current event should
   preserve both old/new definitions and link their canonical identifiers.
3. Open October 30's run for the same book. Its exception ID must differ from
   September's while the commentary text has carried forward.
4. Confirm the exact separate marker **Recertification due to rule change**,
   source date/identifier, and source exception provenance.
5. Confirm the September row and commentary are unchanged and no October 15
   run was needed.
6. Keep New Exceptions Only checked: the pending October item must remain visible.
7. Use Recertify selected without editing the text. The new revision is now
   accepted; review the expected Commented/scope behavior. September is unchanged.
8. Reload and repeat capture/export: acceptance and commentary must not reset.

## Editing and history

- Change only a description: no new executable identifier/recertification.
- Make an ordinary executable refinement: history records a revision.
- Replace every original condition or every expectation: Save must ask
  Modify current / Save as new / Back to editing, with before/after context.
- Back to editing preserves the unsaved draft. Cancel closes the editor without
  saving. Failed Save keeps it open. Backdrop/Escape do not discard the draft.
- Modify current links revisions and preserves old snapshots.
- Save as new preserves the original, starts an independent lineage, and does
  not inherit its commentary. Equivalent logic follows the documented duplicate
  policy instead of fabricating a new canonical identifier.
- Copy remains a new-rule draft with blank name/description and retained groups.
- Inspect the rule history UI and both sides' grouping previews.

## Edge cases and outputs

- New book/unrelated rule: no unrelated commentary copied.
- Cleared source text, a future source date, and changed key schema: no guessed
  carry or resurrection of old text.
- Multiple intervening revisions: original source remains traceable; pending
  comments are not automatically accepted through another revision.
- Existing target commentary remains unchanged by retries/recapture.
- Results-page versus date-wide XLSX retain their correct membership. Marker
  and provenance survive export; uploading text does not silently recertify it.
- Export HTML/Excel and reopen HTML offline: pending state, descriptions, and
  grouping-eye previews remain accurate; no inline Filter X clutter returns.
- Old reports/config files/workbooks still load as documented.

Record observed behavior, screenshots if needed, and unresolved issues against
the integration commit. Merge/push is a separate user decision after testing.
