# Repository cleanup record

Date: 2026-07-18  
Owner: Worker B  
Scope: Worker B follow-ups from `planning/20260718_required_changes_after_second_review.md`.

## What was removed from the working tree

| Path | Reason |
| --- | --- |
| `node_modules/` (root) | Stray install not associated with any workspace; the frontend has its own `frontend/node_modules/`. |
| `.coverage` | Coverage output from a single `pytest` run. |
| `.mypy_cache/` | Type-checker cache. |
| `.pytest_cache/` | Pytest cache. |
| `.ruff_cache/` | Linter cache. |
| `frontend/tsconfig.app.tsbuildinfo` | TypeScript incremental build info. |
| `frontend/tsconfig.node.tsbuildinfo` | TypeScript incremental build info. |

## What was kept (and why)

- `frontend/node_modules/` — installed by `npm install` for the React app. The frontend workspace owns its dependencies.
- `data/uploads/` and `data/results/` — runtime data directories. They are
  in `.gitignore` so they are never committed; the developer regenerates
  them locally. They contain user-uploaded files and saved run results, so
  wiping them needs an explicit decision and was **not** done in this pass.

## Updated `.gitignore` covers

- Stray root `node_modules/` (in addition to `frontend/node_modules/`).
- TypeScript `*.tsbuildinfo`.
- `.coverage` and `.coverage.*`.
- `.DS_Store` and `Thumbs.db` (OS noise).
- `frontend/.vite/` cache.
- Playwright outputs (`test-results/`, `playwright-report/`, `blob-report/`,
  `playwright/.cache/`).
- `data/playwright/` (the Playwright journey pins runtime data here).

## Verification

After the cleanup the working tree contains only intentional source,
configuration templates, tests, docs, and lockfiles. `.gitignore` rejects
every build, cache, and runtime-output pattern observed in this pass.