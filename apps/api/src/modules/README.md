# API Domain Modules Blueprint (`apps/api/src/modules/`)

Intermediate architectural grouping of domain aggregate modules and Express routers following vertical slicing.

## Subdirectories & Components

| Directory                                                           | Type                       | Description                                                                         |
| ------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------- |
| [`administration/`](./administration/README.md)                     | Component Package (Peanut) | Admin orchestration router mounting administrative endpoints.                       |
| [`auth/`](./auth/README.md)                                         | Component Package (Peanut) | User login, token refresh, and logout endpoints.                                    |
| [`catalogs/`](./catalogs/README.md)                                 | Component Package (Peanut) | Cached projections of external Sheets client and equipment catalogs.                |
| [`clients/`](./clients/README.md)                                   | Component Package (Peanut) | Local client metadata and report recipient emails.                                  |
| [`execution/`](./execution/README.md)                               | Component Package (Peanut) | Technician field execution, checklists, photos, signatures, and order finalization. |
| [`health/`](./health/README.md)                                     | Component Package (Peanut) | Liveness (`/live`) and readiness (`/ready`) container probe endpoints.              |
| [`inventory/`](./inventory/README.md)                               | Component Package (Peanut) | Local equipment inventory catalog, status lifecycle, and reservation binding.       |
| [`orders/`](./orders/README.md)                                     | Component Package (Peanut) | Service order aggregate root, unit allocation, pricing engine, and outbox sync.     |
| [`reports/`](./reports/README.md)                                   | Component Package (Peanut) | PDF service report generator, Google Drive storage, and manual Gmail delivery.      |
| [`shared-technician-access/`](./shared-technician-access/README.md) | Component Package (Peanut) | Configuration for communal workshop accounts and multi-order access.                |
| [`technicians/`](./technicians/README.md)                           | Component Package (Peanut) | Technician directory parser and synchronization service.                            |
| [`users/`](./users/README.md)                                       | Component Package (Peanut) | Administrative user CRUD and credential management.                                 |

## Verification

```bash
pnpm --filter @puk/api test
```
