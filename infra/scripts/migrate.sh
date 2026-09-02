#!/usr/bin/env bash
set -euo pipefail

# Bull Dog Solution - Safe Production & Staging Database Migration Runner
# Enforces running migrations exactly once per deployment before service startup

echo "Validating database connectivity and applying pending migrations..."

pnpm prisma:validate
pnpm prisma migrate deploy

echo "Prisma migrations deployed successfully."
