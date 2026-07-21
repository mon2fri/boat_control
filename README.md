# Boat Control

Boat Control is a local-first Django and React application for comparing large CSV files,
validating records against configurable rules, retaining recent results, and exporting reports.

Project planning and worker assignments are in [`planning/`](planning/).

## Start the development application

Run both Django and React from one terminal:

```bash
./scripts/dev.sh
```

Then open <http://127.0.0.1:5173/>. Django runs behind the Vite development proxy at
`http://127.0.0.1:8000` and is also available to devices on the same subnet at
`http://<this-computer's-LAN-IP>:8000`. Press `Ctrl+C` once to stop both servers.

The launcher applies database migrations automatically. It also installs Python or frontend
dependencies when their local installation directories do not exist.

## Deploy to a machine without npm

Build the frontend on a development or CI machine, then copy the generated
`frontend/dist/` directory to the target. The target launcher uses those
prebuilt files and does not start Vite or run npm:

```bash
cd frontend
npm ci
npm run build
```

Copy the following release contents to the target machine:

- `backend/` — Django application code;
- `frontend/dist/` — required prebuilt browser assets;
- `.config` — application settings;
- `config/` — rules, filters, and rows-and-columns configurations;
- `data/` — existing SQLite database, saved results, and uploads when those
  must be retained (otherwise deploy empty writable `data/` directories);
- `trigger.py` — target-machine launcher; and
- Python 3.12 or newer.

Install the backend Python packages on the target once, then start the
application normally. npm is never needed on the target:

```bash
python -m pip install .
python trigger.py
```

To provision Python without target-machine internet access, build a wheel
bundle on the build machine (using the same operating system, CPU, and Python
version as the target), copy `release/wheels/`, then install only from that
directory on the target:

```bash
# Build machine
python -m pip wheel . --wheel-dir release/wheels

# Target machine
python -m pip install --no-index --find-links release/wheels boat-control
```

The Python package includes the Django code under `backend/`; the separately
copied `frontend/dist/`, `.config`, `config/`, and `data/` contents remain
alongside it. Wheel bundles must match the target operating system, CPU, and
Python version. Python 3.12 or newer is required.

`frontend/node_modules/`, `package.json`, and npm are not needed on the
target. Start the deployed application with:

```bash
python trigger.py
```

By default it listens on `0.0.0.0:8000`. The launcher uses a local `.venv`
when present, otherwise the Python interpreter used to run `trigger.py`.
Set `BOAT_CONTROL_PYTHON` to override it, or set
`BOAT_CONTROL_HOST` and `BOAT_CONTROL_PORT` to change the bind address.
