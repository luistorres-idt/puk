# Health Module (`apps/api/src/modules/health/`)

Liveness and readiness health checks for container orchestrators.

## Interface

| Symbol                                | Type     | Description                                   |
| ------------------------------------- | -------- | --------------------------------------------- |
| `createHealthRouter(dependencyCheck)` | Function | Mounts `/live` and `/ready` health endpoints. |

## Invariants

- `/health/live` returns HTTP 200 immediately if process is responsive.
- `/health/ready` executes database ping; returns HTTP 503 if database connection fails.

## Verification

```bash
pnpm --filter @puk/api test
```
