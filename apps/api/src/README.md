# API Source Blueprint (`apps/api/src/`)

Root source tree of the backend service. Configures the Express server pipeline in `app.ts` and wires runtime dependencies in `server.ts`.

## Subsystem Decomposition

| Subdirectory                                  | Type                       | Description                                                                                   |
| --------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------- |
| [`auth/`](./auth/README.md)                   | Component Package (Peanut) | Token issuance, EdDSA cryptographic verification, cookie management, and capability checking. |
| [`config/`](./config/README.md)               | Component Package (Peanut) | Environment variable loading, normalization, and Valibot schema validation.                   |
| [`database/`](./database/README.md)           | Component Package (Peanut) | PostgreSQL connection pool and Prisma Client initialization.                                  |
| [`docs/`](./docs/README.md)                   | Component Package (Peanut) | OpenAPI 3.1 schema derivation and Swagger UI mount.                                           |
| [`integrations/`](./integrations/README.md)   | Intermediate Blueprint     | Google Workspace integrations (Drive, Sheets, Gmail) behind domain ports.                     |
| [`middleware/`](./middleware/README.md)       | Component Package (Peanut) | HTTP error handlers, rate limiters, request IDs, and validation.                              |
| [`modules/`](./modules/README.md)             | Intermediate Blueprint     | Domain aggregate modules (orders, execution, inventory, auth, reports, etc.).                 |
| [`observability/`](./observability/README.md) | Component Package (Peanut) | Winston logging, secret redaction, and Prometheus metrics.                                    |
| [`resilience/`](./resilience/README.md)       | Component Package (Peanut) | Circuit breaker pattern protecting against external API downtime.                             |
| [`shared/`](./shared/README.md)               | Component Package (Peanut) | Common domain errors and HTTP utilities.                                                      |

## Verification

```bash
pnpm --filter @puk/api test
```
