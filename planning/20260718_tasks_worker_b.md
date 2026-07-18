# Worker B Task List — Frontend and UX

## Mandatory working protocol

For **every numbered checklist item**, complete its four sub-checks in order: **Follow** the
requirements and existing plan, **Code** the implementation and tests, **Document** behavior and
decisions, then **Review** your own diff and test evidence. An item is incomplete if any sub-check
is unchecked. Do not move, rename, delete, rewrite, or reorganize the `planning/` directory or
files. You may only mark checkboxes in this assigned task file; record substantive findings in
`docs/` or `reviews/`.

## Checklist

1. [x] Scaffold the React TypeScript client and app shell.
   - [x] Follow: read the initial requirement, folder plan, and backend contract notes first.
   - [x] Code: add routes, local assets, API layer, error boundary, and accessible navigation.
   - [x] Document: add frontend startup, build, test, and component conventions under `docs/`.
   - [x] Review: run lint/tests/build and verify that production makes no external requests.

2. [x] Build the upload/network-source and header-review workflow.
   - [x] Follow: expose shared and differing headers before comparison begins.
   - [x] Code: implement two-file input, preset-source selection, progress, errors, and highlights.
   - [x] Document: describe workflow states, validation messages, and supported input behavior.
   - [x] Review: test keyboard use, cancellation, failures, hostile names, and large header lists.

3. [x] Build filter and target selection.
   - [x] Follow: use the required row layout, operators, starred values, and target fallback rules.
   - [x] Code: add searchable controls, dynamic filter rows, comma input, and validation feedback.
   - [x] Document: describe interaction rules, empty states, and the full-set confirmation dialog.
   - [x] Review: test inaccessible values, duplicates, invalid columns, and the 2,000-row boundary.

4. [x] Build rule selection and rule-configuration UI.
   - [x] Follow: support rule CRUD, optional conditions/grouping, both mandatory logic formats.
   - [x] Code: implement editors, Rxxx display, consistent and/or flows, and unsaved-change guards.
   - [x] Document: add user guidance and examples for simple and grouped rules.
   - [x] Review: test validation, keyboard/focus behavior, destructive confirmation, and API errors.

5. [x] Build run execution and result pages.
   - [x] Follow: show every required overall/per-rule count, details, logic, and floating contents.
   - [x] Code: add progress, summary cards, virtualized detail tables, and anchored navigation.
   - [x] Document: define result terminology and zero/error/loading states.
   - [x] Review: test large result sets, responsive layouts, accessibility, and count consistency.

6. [x] Build report naming, history, and export controls.
   - [x] Follow: default to `{file1}_vs_{file2}`, support double-click editing and ten-run history.
   - [x] Code: implement safe rename UI, history picker/loading, and HTML/CSV export actions.
   - [x] Document: explain autosave, rename, retention, reload, and export behavior.
   - [x] Review: test collisions, invalid names, stale runs, download failures, and keyboard editing.

7. [x] Complete frontend security and offline-runtime hardening.
   - [x] Follow: native JavaScript and raw DOM manipulation are prohibited; use React APIs only.
   - [x] Code: avoid raw HTML sinks, validate API payloads with Zod, and bundle all dependencies.
   - [x] Document: record the client threat model and safe-rendering conventions.
   - [x] Review: test stored-XSS payloads, DOM injection, unsafe links, and external network access.

8. [x] Complete UI integration and handoff.
   - [x] Follow: reconcile contracts with worker A without changing files in `planning/`.
   - [x] Code: finish component, integration, and critical user-journey tests.
   - [x] Document: provide build/deploy, testing, accessibility, and troubleshooting guidance.
   - [x] Review: run lint, type-check, tests, production build, dependency audit, and final diff review.
