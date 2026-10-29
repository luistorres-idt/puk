# Database Migrations (`prisma/migrations/`)

Versioned PostgreSQL schema migrations managed by Prisma Migrate, migration lockfile tracking, and operational migration policies.

## Developer Policy & Overview

Generate migrations through Prisma from the repository root. Once a migration has been applied to a shared environment, add a new migration instead of editing the existing one.

### Service types added on 2026-09-08

`20260908120000_add_order_service_types` adds `FUEL_SENSOR` and
`EQUIPMENT_REPLACEMENT` without replacing the enum or updating historical orders.
Apply it before deploying consumers that use the new values. PostgreSQL requires
committing an enum addition before using its value in the same migration sequence
([ALTER TYPE documentation](https://www.postgresql.org/docs/current/sql-altertype.html)).

The application supports both values in service configuration, orders, pricing and
Google Sheets synchronization. `FUEL_SENSOR` selects available stock for installation;
`EQUIPMENT_REPLACEMENT` links an installed device to its replacement. Their workflow
and workbook rules are documented in `docs/technician-workbook-contract.md`. This
migration note is historical and does not mean the values are still awaiting approval.
`Order.technicianId` remains nullable for historical records. Regularization must
use verified technician assignments and audit each change; no automatic backfill
or `NOT NULL` constraint is introduced.

## Interface

| File / Command                     | Type          | Description                                                                 |
| ---------------------------------- | ------------- | --------------------------------------------------------------------------- |
| `migration_lock.toml`              | Lockfile      | Declares PostgreSQL provider target (`provider = "postgresql"`).            |
| `[timestamp]_[name]/migration.sql` | SQL Artifacts | Versioned migration DDL scripts defining schema revisions.                  |
| `pnpm prisma:migrate`              | CLI Command   | Executes `prisma migrate dev` against development database.                 |
| `pnpm prisma migrate deploy`       | CLI Command   | Applies pending migrations in non-interactive staging/production pipelines. |

## Invariants

- **Immutability**: Once applied to a shared environment, existing migrations are immutable; changes require forward migrations.
- **PostgreSQL Enum Commit Barrier**: PostgreSQL enum additions (`ALTER TYPE ... ADD VALUE`) must be committed before referencing the added values in subsequent statements.
- **Historical Nullability**: `Order.technicianId` remains nullable for historical records; no automatic `NOT NULL` backfill without verified technician audits.
- **Provider Consistency**: Target database provider must remain PostgreSQL.

## Side Effects

- Applies DDL schema modifications (tables, enums, constraints, indexes) directly to the target PostgreSQL database.
- Updates migration tracking table (`_prisma_migrations`) in PostgreSQL.

## Verification

```bash
pnpm prisma:validate
```
