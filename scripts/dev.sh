#!/usr/bin/env bash

set -Eeuo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
backend_pid=""
frontend_pid=""

cleanup() {
    local exit_code=$?
    trap - EXIT INT TERM

    if [[ -n "$backend_pid" ]] && kill -0 "$backend_pid" 2>/dev/null; then
        kill "$backend_pid" 2>/dev/null || true
    fi
    if [[ -n "$frontend_pid" ]] && kill -0 "$frontend_pid" 2>/dev/null; then
        kill "$frontend_pid" 2>/dev/null || true
    fi

    [[ -n "$backend_pid" ]] && wait "$backend_pid" 2>/dev/null || true
    [[ -n "$frontend_pid" ]] && wait "$frontend_pid" 2>/dev/null || true

    exit "$exit_code"
}

trap cleanup EXIT INT TERM

command -v uv >/dev/null 2>&1 || {
    echo "Error: uv is not installed or is not on PATH." >&2
    exit 1
}
command -v npm >/dev/null 2>&1 || {
    echo "Error: npm is not installed or is not on PATH." >&2
    exit 1
}

cd "$project_dir"

if [[ ! -x .venv/bin/python ]]; then
    echo "Python environment not found; installing dependencies..."
    uv sync
fi

if [[ ! -d frontend/node_modules ]]; then
    echo "Frontend dependencies not found; installing dependencies..."
    npm --prefix frontend install
fi

echo "Applying database migrations..."
uv run python backend/manage.py migrate --settings=boat_control.settings --noinput

echo "Starting Django at http://127.0.0.1:8000"
uv run python backend/manage.py runserver 127.0.0.1:8000 \
    --settings=boat_control.settings --noreload &
backend_pid=$!

echo "Starting React at http://127.0.0.1:5173"
npm --prefix frontend run dev -- --host 127.0.0.1 &
frontend_pid=$!

echo
echo "Boat Control is starting. Open http://127.0.0.1:5173/"
echo "Press Ctrl+C to stop both servers."
echo

set +e
wait -n "$backend_pid" "$frontend_pid"
server_exit=$?
set -e

if [[ $server_exit -ne 0 ]]; then
    echo "A development server exited with status $server_exit; stopping both." >&2
else
    echo "A development server stopped; stopping both."
fi
exit "$server_exit"
