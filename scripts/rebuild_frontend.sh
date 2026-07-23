#!/usr/bin/env bash

# Rebuilds the production frontend bundle in frontend/dist/.
# The dist is tracked in the repo, so the rebuilt assets need to be
# committed for the change to take effect in deployments that serve
# from the prebuilt bundle (e.g. the offline browser bundle).

set -Eeuo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

command -v npm >/dev/null 2>&1 || {
    echo "Error: npm is not installed or is not on PATH." >&2
    exit 1
}

if [[ ! -d frontend/node_modules ]]; then
    echo "Frontend dependencies not found; installing..."
    npm --prefix frontend install
fi

echo "Rebuilding frontend production bundle..."
npm --prefix frontend run build

echo
echo "Done. Review the changes with: git status frontend/dist"
echo "Commit them with: git add frontend/dist && git commit"
