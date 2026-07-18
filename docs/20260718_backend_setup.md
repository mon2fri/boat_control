# Backend Setup and Configuration

## Prerequisites

- Python 3.14+
- `uv` package manager (recommended)

## Quick Start

```bash
# Install dependencies
uv sync

# Run database migrations (SQLite, auto-created)
uv run python backend/manage.py migrate --settings=boat_control.settings

# Start the development server
uv run python backend/manage.py runserver --settings=boat_control.settings
```

The server starts on `http://127.0.0.1:8000/` by default.

## Health Check

Verify the backend is running:

```bash
curl http://127.0.0.1:8000/api/health/
# Expected: {"status": "ok"}
```

## Project Layout

```text
backend/
├── boat_control/        # Django project: settings, URLs, ASGI/WSGI
└── apps/                # Domain applications
    ├── health/          # Health check endpoint
    ├── files/           # CSV upload and header inspection
    ├── rules/           # Validation rule configuration
    ├── runs/            # Comparison run execution and persistence
    └── reports/         # HTML and CSV export
```

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `DJANGO_SECRET_KEY` | dev-only key | Secret key for Django |
| `DJANGO_DEBUG` | `true` | Enable debug mode |
| `MAX_UPLOAD_SIZE_MB` | `500` | Maximum CSV upload size |
| `MAX_COLUMNS` | `500` | Maximum columns per CSV |
| `DEFAULT_RUN_RETENTION` | `10` | Number of runs to retain |

## Data Directories

| Path | Purpose |
|------|---------|
| `data/uploads/` | Staged CSV input files |
| `data/results/` | Run results and exports |
| `config/settings/` | User/application settings |
| `config/rules/` | Validation rules |
| `config/filters/` | Saved filters |

## Architecture Notes

- Local-first: no external resource fetching at runtime
- SQLite for database (no external DB server required)
- Polars for CSV processing (Arrow-backed, memory-efficient)
- REST framework JSON APIs for React frontend communication
