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
