# API HTTP Middleware (`apps/api/src/middleware/`)

Express middleware pipeline: error handling, rate limiting, request ID tagging, and Valibot schema validation.

## Interface

| Middleware                                        | Description                                                                      |
| ------------------------------------------------- | -------------------------------------------------------------------------------- |
| `errorHandler`                                    | Intercepts application exceptions and formats standardized JSON error responses. |
| `notFound`                                        | Catches unmapped routes and returns 404 AppError.                                |
| `generalRateLimit`, `authRateLimit`               | IP and token-based rate limiters protecting against denial of service.           |
| `requestId`                                       | Injects unique UUID `X-Request-Id` for request lifecycle tracing.                |
| `validateBody`, `validateQuery`, `validateParams` | Validates request payloads against Valibot schemas.                              |

## Invariants

- **Schema Transformation**: Validation failures return RFC-compliant 400 Bad Request error objects detailing field issues.
- **Trace Redaction**: Stack traces are redacted in production and staging environments.

## Verification

```bash
pnpm --filter @puk/api test
```
