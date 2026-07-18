# Folder Structure Plan

## Architectural boundary

Boat Control is a local-first web application. Django owns file access, CSV processing,
validation, persistence, and exports. React owns the browser workflow and communicates only
with Django APIs. Runtime code must not fetch scripts, fonts, styles, or other resources from
external hosts.

## Planned structure

```text
boat_control/
├── backend/                 # Django project and domain apps
│   ├── boat_control/        # Settings, root URLs, ASGI/WSGI
│   └── apps/                # imports, filters, rules, runs, reports
├── frontend/                # React + TypeScript client
│   ├── public/              # Bundled local static assets
│   └── src/                 # Features, components, API client, routes
├── config/
│   ├── settings/            # User/application settings
│   ├── rules/               # Default and user validation rules
│   └── filters/             # Saved filters
├── data/
│   ├── uploads/             # Staged CSV input; excluded from source control
│   └── results/             # Last ten JSON runs and generated exports
├── docs/                    # Maintained product/developer documentation
├── planning/                # Fixed plans and worker checklists; never relocate
├── requirements/            # Source requirements and change requests
├── reviews/                 # Review findings and decisions
├── tests/
│   ├── backend/             # Unit and service-level tests
│   └── integration/         # API and end-to-end workflow tests
├── pyproject.toml           # Python runtime/dev dependencies and tooling
└── README.md
```

## Design decisions

- Use Polars with Arrow support for projected/lazy CSV processing; do not load all 120,000 ×
  200 cells into Python objects.
- Store editable configuration as versioned YAML with schema validation at the service boundary.
- Store each completed run as JSON and enforce a ten-run retention policy through one service.
- Treat uploaded names and report names as untrusted input; generate safe server-side paths.
- Render all user-derived content through React text bindings. Do not use raw HTML injection.
- Bundle the production frontend into Django-served static files for offline runtime operation.

## Ownership

- Worker A owns Django, CSV processing, configuration, persistence, exports, and backend tests.
- Worker B owns React workflows, accessibility, safe rendering, client tests, and UI integration.
- Shared API contracts require a planning note or review record, but neither worker may move,
  rename, delete, or reorganize `planning/` or any file within it.
