# Configuration, Sources, and Safe Rule Evaluation Enhancement

Date: 2026-07-18  
Status: Proposed requirement  
Applies to: Boat Control

## Goal

Extend Boat Control so users can manage named settings, rule, and filter
configuration files from the application; choose CSV input from an approved
remote folder or local upload; and safely evaluate saved rule/filter logic.

## 1. Named configuration files

### 1.1 Configuration types

The application shall manage these independent configuration types:

- Application settings
- Rule configurations
- Saved-filter configurations

Each configuration is stored as a project-owned file under configured roots:

```
config/settings/
config/rules/
config/filters/
```

The application shall not accept arbitrary filesystem paths from the browser
for loading or saving configurations.

### 1.2 Named configurations and picker

- A user can create and save multiple named rule and filter configurations.
- A dropdown lists all available configurations of the current type.
- Choosing an entry loads and displays its contents in the applicable screen:
  - settings in Settings;
  - rules in Rule configuration;
  - filters in Filters and targets.
- The currently selected configuration name is visible.
- The application provides an explicit action to create a new named
  configuration. A new name must be unique within its type.
- Names must be validated: non-empty, maximum 120 characters, no path
  separators, control characters, or `.` / `..` path segments.

### 1.3 Save and unsaved changes

- After a configuration is loaded, Save is disabled while the displayed form
  is identical to the persisted version.
- Editing any field makes Save enabled, provided the content is valid.
- Save writes the current configuration atomically to its project-owned file.
- Successful save updates the persisted baseline, disables Save again, and
  displays a success message.
- Invalid content keeps Save disabled and displays field-level validation
  errors.
- Switching configuration, leaving the page, or creating another
  configuration while there are unsaved changes requires an accessible
  confirm/discard dialog.
- Concurrent writes must not silently overwrite a newer saved version. The
  API shall use a revision/version value and return a conflict response when
  the client saves an outdated revision.

### 1.4 Application settings

Application settings are persisted in a named settings configuration file and
include at least:

- approved preset/remote source locations;
- default selected rule configuration;
- default selected filter configuration;
- full-set confirmation threshold.

Changes take effect for subsequent requests after Save. A running comparison
continues with the settings captured when it started.

## 2. CSV input sources

### 2.1 Local upload

- The Upload screen continues to provide two local CSV file selectors.
- The user can upload two files at once: baseline and candidate.
- Existing CSV type, size, header inspection, and opaque-session safeguards
  continue to apply.

### 2.2 Approved remote folder

- Settings can define a default remote folder, for example:

  ```text
  \\remote-machine\folder\subfolder
  ```

- The Upload screen provides a source selector with Local upload and each
  configured remote source.
- Selecting a remote source lists only CSV files within that configured,
  approved folder and lets the user choose a baseline and candidate file.
- The browser never submits an arbitrary UNC path or arbitrary server path.
  It submits an opaque source ID and opaque file IDs returned by the server.
- The server resolves those IDs only beneath configured allowed roots and
  rejects traversal, symlink escape, unavailable shares, and non-CSV files
  with stable user-facing errors.

### 2.3 Deployment note

A Windows UNC path is feasible only when the Django host process can access
that share under its service account. On non-Windows hosts, the share must be
mounted by deployment configuration and exposed to the application as an
approved local directory. Credentials must be supplied by the operating
system/service account or a secret manager, never through the browser or a
configuration file committed to the repository.

## 3. Saved filters

Saved filters use the named filter-configuration mechanism in section 1.

- A filter configuration stores ordered filter rows and, optionally, selected
  target and key columns.
- The Filters and targets screen can load a named filter configuration from a
  dropdown.
- It displays the loaded rows in the existing editor and tracks unsaved
  changes.
- Saving writes a named filter configuration; it does not alter a comparison
  already running.

## 4. Runtime network policy

The application must make no external runtime requests except for:

1. CSV data explicitly uploaded by the user; and
2. CSV files selected from an administrator-configured remote source described
   in section 2.

In particular, the application must not fetch rule, filter, settings, code,
scripts, stylesheets, fonts, analytics, or other resources from arbitrary
URLs. Remove or disable arbitrary URL-based rule loading. Remote-source access
is server-side only and is limited to configured allowlisted folders.

## 5. Safe executable rule and filter evaluation

### Decision

Do **not** convert rule/filter content into Python, JavaScript, SQL, or shell
strings and execute it with `exec`, `eval`, dynamic imports, or a shell. This
would permit code injection through a configuration file.

### Required design

- Rules and filters remain declarative JSON/YAML data validated against a
  strict schema.
- The schema allows only documented operators, columns from the uploaded
  session, literal scalar values, condition relations, and the grouping-tree
  grammar.
- A trusted application function compiles validated declarations into a
  restricted internal expression tree (or directly into Polars expression
  objects). The compiler must never parse user content as programming code.
- The evaluator accepts only that typed internal representation and an
  explicitly projected dataset. It rejects unknown columns, unknown
  operators, invalid grouping references, type-incompatible comparisons, and
  malformed values with stable validation errors.
- The compiled representation is in-memory only. Persist the declarative
  configuration and its revision, not generated executable code.
- Tests must include injection-shaped strings in configuration names, values,
  YAML fields, remote source identifiers, and rule/filter payloads; those
  strings must be treated as data or rejected, never executed.

This approach is feasible and safer than `exec`: it supports the current
equals/not-equals/contains/numeric operators and nested AND/OR grouping while
preserving a small, auditable evaluation surface.

## Acceptance criteria

1. Users can create, select, load, modify, and atomically save multiple named
   rule and filter configurations; the picker updates after each save.
2. Save is disabled when no changes exist and enabled only for valid changed
   content; unsaved-change protection and revision-conflict handling work.
3. Settings persist to a project-owned configuration file and affect later
   requests.
4. Users can either upload two local CSV files or select two CSV files from a
   configured remote source using opaque IDs.
5. Arbitrary filesystem paths and arbitrary URL-based rule/config loading are
   rejected.
6. Rule and filter configurations evaluate through schema validation plus a
   typed allowlisted evaluator; no `exec`, `eval`, shell, or dynamic code
   execution is used.
7. Backend API tests, frontend interaction tests, and a browser journey cover
   local upload, remote-source selection, configuration save/load, unsaved
   changes, conflicts, and hostile input.
