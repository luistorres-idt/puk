# Prisma Schema & Database Package (`prisma/`)

Data layer blueprints and schema definition for the Bull Dog Solution platform, including Prisma schema models, client generator configuration, and database seeding scripts.

## Subdirectories & Components

| Directory / File                        | Type                       | Description                                                                            |
| --------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------- |
| [`migrations/`](./migrations/README.md) | Component Package (Peanut) | Versioned PostgreSQL schema migrations and DDL scripts.                                |
| [`schema.prisma`](./schema.prisma)      | Data Schema                | PostgreSQL entity models, relations, enums, indexes, and client generator config.      |
| [`seed.ts`](./seed.ts)                  | Seed Script                | Database bootstrap seeding administrative users, technicians, and local test fixtures. |

## Interface

| Symbol / Command                         | Type        | Description                                                                                                |
| ---------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------- |
| `schema.prisma`                          | Schema      | Prisma data models for users, technicians, orders, units, equipment, checklists, evidence, and audit logs. |
| `seedUsers(environment?, dependencies?)` | Function    | Seeds development and production users into PostgreSQL (`seed.ts`).                                        |
| `pnpm prisma:generate`                   | CLI Command | Generates typed Prisma Client into `apps/api/src/generated/prisma`.                                        |
| `pnpm prisma:validate`                   | CLI Command | Validates Prisma schema syntax and model integrity.                                                        |
| `pnpm prisma:migrate`                    | CLI Command | Applies migrations in development environment.                                                             |
| `pnpm prisma:seed`                       | CLI Command | Executes `prisma/seed.ts` via `tsx`.                                                                       |

## Invariants

- **Client Output**: Prisma client output points to `../apps/api/src/generated/prisma`.
- **Connection URL Hierarchy**: Database connection resolution prioritizes `TEST_DATABASE_URL` > `DIRECT_URL` > `DATABASE_URL` > `PUK_DATABASE_*` environment parameters.
- **Production Seeding Requirements**: Seeding outside development strictly requires `SEED_ADMIN_PASSWORD`, `SEED_CLIENT_ADMIN_EMAIL`, and `SEED_CLIENT_ADMIN_PASSWORD`. Admin and client admin emails must differ.
- **Referential Integrity**: Foreign key referential actions adhere to explicit schema constraints (`Cascade`, `Restrict`, `SetNull`).

## Side Effects

- `pnpm prisma:generate` writes generated TypeScript client files to `apps/api/src/generated/prisma`.
- `pnpm prisma:seed` inserts or upserts default administrative users and technicians in PostgreSQL.
- Database connections opened during seeding or migration are cleanly disconnected on completion.

## Verification

```bash
pnpm prisma:validate
```
