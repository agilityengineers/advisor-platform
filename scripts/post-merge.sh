#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [[ "${NODE_ENV:-development}" == "production" ]]; then
  echo "Post-merge setup is for the development workspace, not production." >&2
  exit 1
fi

echo "Installing locked workspace dependencies..."
CI=true pnpm install --frozen-lockfile

echo "Applying pending development database migrations..."
pnpm db:migrate

echo "Checking types and building the application..."
pnpm build
