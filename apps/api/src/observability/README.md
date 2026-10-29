# API Observability (`apps/api/src/observability/`)

Structured JSON logging with Winston, Morgan HTTP access logging, sensitive data redaction, and Prometheus metrics.

## Interface

| Symbol                         | Type                | Description                                                                   |
| ------------------------------ | ------------------- | ----------------------------------------------------------------------------- |
| `logger`                       | Object              | Winston logger instance formatting structured JSON.                           |
| `httpLogger`                   | Middleware          | Morgan HTTP request access logging middleware.                                |
| `metrics`, `metricsMiddleware` | Object / Middleware | Prometheus metrics registry tracking latency, error counts, and outbox depth. |

## Invariants

- **Secret Redaction**: Recursively strips passwords, tokens, private keys, and client secrets from log metadata.
- **Metrics Privacy**: Internal metrics endpoints (`/metrics`) are isolated from public ingress.

## Verification

```bash
pnpm --filter @puk/api test
```
