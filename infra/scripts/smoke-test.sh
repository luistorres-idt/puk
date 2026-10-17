#!/usr/bin/env bash
set -euo pipefail

# Bull Dog Solution - Deployment Smoke Test Script
# Verifies health endpoints, metrics isolation and OpenAPI documentation availability

TARGET_URL="${TARGET_URL:-http://localhost:4173}"

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

# 3. Operational metrics must not be exposed through the public web listener.
echo -n "Checking /metrics is private... "
METRICS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_URL}/metrics")
if [ "$METRICS_STATUS" -ne 404 ]; then
  echo "FAILED (Status: $METRICS_STATUS)"
  exit 1
fi
echo "OK (404)"

echo -n "Checking /health/metrics is private... "
HEALTH_METRICS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_URL}/health/metrics")
if [ "$HEALTH_METRICS_STATUS" -ne 404 ]; then
  echo "FAILED (Status: $HEALTH_METRICS_STATUS)"
  exit 1
fi
echo "OK (404)"

# 4. OpenAPI docs
echo -n "Checking /docs/... "
DOCS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_URL}/docs/")
if [ "$DOCS_STATUS" -ne 200 ] && [ "$DOCS_STATUS" -ne 301 ]; then
  echo "FAILED (Status: $DOCS_STATUS)"
  exit 1
fi
echo "OK ($DOCS_STATUS)"

echo "All smoke tests passed successfully!"
