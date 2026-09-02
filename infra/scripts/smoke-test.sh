#!/usr/bin/env bash
set -euo pipefail

# Bull Dog Solution - Deployment Smoke Test Script
# Verifies health endpoints, metrics and OpenAPI documentation availability

TARGET_URL="${TARGET_URL:-http://localhost:3000}"

echo "Starting smoke tests against ${TARGET_URL}..."

# 1. Liveness check
echo -n "Checking /health/live... "
LIVE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_URL}/health/live")
if [ "$LIVE_STATUS" -ne 200 ]; then
  echo "FAILED (Status: $LIVE_STATUS)"
  exit 1
fi
echo "OK (200)"

# 2. Readiness check
echo -n "Checking /health/ready... "
READY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_URL}/health/ready")
if [ "$READY_STATUS" -ne 200 ]; then
  echo "FAILED (Status: $READY_STATUS)"
  exit 1
fi
echo "OK (200)"

# 3. Metrics exposition
echo -n "Checking /metrics... "
METRICS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_URL}/metrics")
if [ "$METRICS_STATUS" -ne 200 ]; then
  echo "FAILED (Status: $METRICS_STATUS)"
  exit 1
fi
echo "OK (200)"

# 4. OpenAPI docs
echo -n "Checking /docs/... "
DOCS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_URL}/docs/")
if [ "$DOCS_STATUS" -ne 200 ] && [ "$DOCS_STATUS" -ne 301 ]; then
  echo "FAILED (Status: $DOCS_STATUS)"
  exit 1
fi
echo "OK ($DOCS_STATUS)"

echo "All smoke tests passed successfully!"
