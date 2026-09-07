#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Bull Dog Solution Staging E2E Test Suite Runner
#
# Independent, requirement-driven opaque-box verification across 4 Tiers:
# - Tier 1: Feature Coverage (Web, API, health endpoints, metrics, docs)
# - Tier 2: Boundary & Corner Cases (Direct ALB blocking, redirects, routing)
# - Tier 3: Cross-Feature Combinations (Caching, security headers, cookies, auth)
# - Tier 4: Real-World Scenarios (End-to-end sessions, edge latency, cloud health)
#
# Authoritative contracts: docs/technical/ and infra/cdk/
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Default settings
CLOUDFRONT_URL="${CLOUDFRONT_URL:-${TARGET_URL:-}}"
ALB_URL="${ALB_URL:-}"
ORIGIN_SECRET="${ORIGIN_VERIFY_SECRET:-puk-staging-075566976700-us-east-2-origin-verify}"
AWS_REGION="${AWS_REGION:-us-east-2}"
TIER="${TIER:-all}"
USE_MOCK=false
JSON_OUTPUT=false

print_usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  --url <URL>           CloudFront HTTPS base URL (e.g. https://d123456.cloudfront.net)
  --alb <URL>           ALB origin base URL (e.g. http://puk-st-loadb-xxx.us-east-2.elb.amazonaws.com)
  --secret <SECRET>     Shared X-Origin-Verify secret header value
  --tier <1|2|3|4|all>  Run specific test tier (default: all)
  --mock                Run against local in-memory high-fidelity mock staging environment
  --json                Output results in JSON format
  --help, -h            Show this help message

Environment Variables:
  CLOUDFRONT_URL        Same as --url
  ALB_URL               Same as --alb
  ORIGIN_VERIFY_SECRET  Same as --secret
  AWS_REGION            AWS region (default: us-east-2)
  MOCK_E2E              Set to 1 or true to force mock mode
EOF
}

# Parse CLI arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --url)
      CLOUDFRONT_URL="$2"
      shift 2
      ;;
    --alb)
      ALB_URL="$2"
      shift 2
      ;;
    --secret)
      ORIGIN_SECRET="$2"
      shift 2
      ;;
    --tier)
      TIER="$2"
      shift 2
      ;;
    --mock)
      USE_MOCK=true
      shift
      ;;
    --json)
      JSON_OUTPUT=true
      shift
      ;;
    --)
      shift
      ;;
    --help|-h)
      print_usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      print_usage
      exit 1
      ;;
  esac
done

if [[ "${MOCK_E2E:-}" == "true" || "${MOCK_E2E:-}" == "1" ]]; then
  USE_MOCK=true
fi

# If neither URL is provided and not in mock mode, attempt CloudFormation auto-discovery
if [[ -z "${CLOUDFRONT_URL}" && "$USE_MOCK" = false ]]; then
  if command -v aws >/dev/null 2>&1; then
    echo "🔍 Attempting CloudFormation auto-discovery for PukStagingApplication..."
    CFN_URL=$(aws cloudformation describe-stacks \
      --stack-name PukStagingApplication \
      --region "${AWS_REGION}" \
      --query "Stacks[0].Outputs[?OutputKey=='StagingUrl'].OutputValue" \
      --output text 2>/dev/null || true)

    if [[ -n "${CFN_URL}" && "${CFN_URL}" != "None" ]]; then
      CLOUDFRONT_URL="${CFN_URL}"
      echo "Found CloudFront URL from CloudFormation: ${CLOUDFRONT_URL}"
    fi
  fi
fi

# If ALB_URL is not provided and not in mock mode, attempt AWS discovery
if [[ -z "${ALB_URL}" && "$USE_MOCK" = false ]]; then
  if command -v aws >/dev/null 2>&1; then
    DISCOVERED_ALB=$(aws elbv2 describe-load-balancers \
      --region "${AWS_REGION}" \
      --query "LoadBalancers[?contains(LoadBalancerName, 'Puk')].DNSName" \
      --output text 2>/dev/null || true)
    if [[ -n "${DISCOVERED_ALB}" && "${DISCOVERED_ALB}" != "None" ]]; then
      ALB_URL="http://${DISCOVERED_ALB}"
      echo "Found ALB URL from AWS: ${ALB_URL}"
    fi
  fi
fi

# If still no URL, fallback to local mock server
if [[ -z "${CLOUDFRONT_URL}" && "$USE_MOCK" = false ]]; then
  echo "⚠️  No CLOUDFRONT_URL provided and CloudFormation stack not accessible."
  echo "💡 Defaulting to local high-fidelity mock staging environment (--mock)."
  USE_MOCK=true
fi

# Build arguments for tsx runner
RUNNER_ARGS=()
if [[ "$USE_MOCK" = true ]]; then
  RUNNER_ARGS+=("--mock")
fi
if [[ -n "${CLOUDFRONT_URL}" ]]; then
  RUNNER_ARGS+=("--url" "${CLOUDFRONT_URL}")
fi
if [[ -n "${ALB_URL}" ]]; then
  RUNNER_ARGS+=("--alb" "${ALB_URL}")
fi
if [[ -n "${ORIGIN_SECRET}" ]]; then
  RUNNER_ARGS+=("--secret" "${ORIGIN_SECRET}")
fi
if [[ "${TIER}" != "all" ]]; then
  RUNNER_ARGS+=("--tier" "${TIER}")
fi
if [[ "$JSON_OUTPUT" = true ]]; then
  RUNNER_ARGS+=("--json")
fi

# Run the master TypeScript test runner
cd "${PROJECT_ROOT}"
export ORIGIN_VERIFY_SECRET="${ORIGIN_SECRET}"
export AWS_REGION="${AWS_REGION}"

exec pnpm exec tsx tests/e2e/run-all.ts "${RUNNER_ARGS[@]}"
