# Target Deployment Files

Copy this project content to the target machine:

- `backend/` — Django application source.
- `frontend/dist/` — prebuilt browser application.
- `config/` — rules, filters, and rows-and-columns configuration.
- `.config` — application settings.
- `data/` — keep this when existing run history, reports, uploads, or the
  SQLite database must be retained. Otherwise create an empty, writable
  `data/` directory.
- `trigger.py` — service launcher.
- `pyproject.toml` — Python dependency definition for `pip install .`.

Optional:

- `release/wheels/` — only for offline Python package installation. Its wheels
  must match the target operating system, CPU architecture, and Python version.

Do not copy these for normal target operation:

- `frontend/node_modules/`
- npm or Vite build tooling
- `tests/`, `docs/`, `planning/`, and screenshots

## Target commands

The target needs Python 3.12 or newer. Install Python packages manually:

```bash
python -m pip install .
python trigger.py
```

`trigger.py` only starts the application. It does not install dependencies,
run npm, start Vite, or make external package requests.
