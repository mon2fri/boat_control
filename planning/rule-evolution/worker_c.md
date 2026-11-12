# Worker C — Save confirmation, rule history, and recertification UI

Read `README.md`, `shared_contract.md`, and the requirements first.

Branch: `feat/rule-evolution-worker-c`
Worktree: `/home/zwj808/PycharmProjects/boat_control-worktrees/rule-evolution/worker-c`

Verify branch/directory/common base. Target every command/edit at your worktree;
do not assume inherited cwd was changed. Ask the integrator about missing or
dirty worktrees instead of sharing another checkout.

## Assignment

Own the frontend end to end, using A/B's agreed payloads. You may develop with
contract fixtures while their implementations proceed, but final behavior must
use the real endpoints and survive the API schemas/mappers.

When A reports an extensive edit, show before/after context and explicit
**Modify current**, **Save as new**, and **Back to editing** actions. Keep the
draft intact and retry with the selected decision/concurrency token. Handle a
stale source and equivalent identity conflicts clearly. Preserve the source
selection for save-as-new; replace the selected catalog ID only for actual
modify-current replacement. Do not make the decision solely in the browser.

Retain the existing editor overlay: successful save or explicit Cancel closes
it; failed saves and confirmation cancellation do not discard the draft.
Backdrop/Escape must not dismiss the editor. Copy remains new-rule semantics.
Nested confirmations must remain visible and keyboard-accessible within the
native modal dialog; a portal outside a modal's top layer can be inert/hidden.

Add a readable rule-history view showing revision/time, old/new identifiers,
decision, and before/after definition/grouping. Use persisted history rather
than reconstructing it from the mutable catalog. Decide placement with the
integrator without introducing a separate application/navigation redesign.

Show **Recertification due to rule change** separately from commentary in
tracking and results, with source revision/date available. Support selection
and the agreed explicit **Recertify selected** action. Users must be able to
accept unchanged text. Pending items remain visible with New Exceptions Only;
do not infer acceptance from nonblank text or an XLSX upload.

Retain grouping-eye previews, offline HTML behavior, numbered badge colors,
commentary filename conventions, and the uncluttered Overall result card.
If B adds export metadata fields, retain them through wire/domain/mapping and
rendered HTML, including reloaded historical reports. No current-catalog lookup
may overwrite historical rule definitions.

## Ownership

All `frontend/src/` changes and frontend test changes, including API
endpoints/wire/domain/mapping, RulesPage/editor, tracking/results views,
history UI, and offline HTML script as needed. Do not edit backend files or
lockfiles without demonstrating necessity to the integrator.

Do not commit `frontend/dist/`; the integrator builds it once on the combined
tree. For build verification without overwriting tracked assets, run
`npm run build -- --outDir /tmp/boat-rule-evolution-worker-c-dist` in `frontend`.

## Required evidence

Test both Save choices and back-to-editing, stale/failed saves, copy semantics,
history rendering, new-rule selection preservation, optional legacy fields,
pending status display and filters, explicit unchanged-text acceptance, and
failure preservation. Verify both embedded and standalone rules views.
Exercise modal focus and stacking in a real browser where available.

Commit implementation/tests and
`reviews/20261112_rule_evolution_worker_c_delivery.md`; send hashes, fixtures/API
assumptions, actual tests/build results, and any blocked integration to the
integrator. Do not push or regenerate final tracked frontend assets.
