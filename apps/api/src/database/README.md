# API Database Client (`apps/api/src/database/`)

Initializes and configures the PostgreSQL Prisma Client with driver adapter connection pooling.

## Interface

| Symbol                                 | Type     | Description                                                     |
| -------------------------------------- | -------- | --------------------------------------------------------------- |
| `createPrismaClient(connectionString)` | Function | Instantiates PrismaClient configured with `@prisma/adapter-pg`. |

## Invariants

- **Adapter-Driven**: Uses `@prisma/adapter-pg` driver adapter for connection pooling.
- **Singleton Lifecycle**: Maintains a singleton client instance per application process lifecycle.

## Verification

```bash
pnpm --filter @puk/api test
```
