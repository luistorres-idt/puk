# Web Domain Modules Blueprint (`apps/web/src/modules/`)

Intermediate grouping of frontend feature slices following vertical domain structure.

## Subdirectories & Modules

| Module                                                  | Type                       | Description                                                                   |
| ------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------- |
| [`admin-users/`](./admin-users/README.md)               | Component Package (Peanut) | User account administration views.                                            |
| [`auth/`](./auth/README.md)                             | Component Package (Peanut) | Authentication login interface.                                               |
| [`clients/`](./clients/README.md)                       | Component Package (Peanut) | Client report email configuration.                                            |
| [`external-catalogs/`](./external-catalogs/README.md)   | Component Package (Peanut) | Client and equipment selectors with autocomplete and fuzzy search.            |
| [`home/`](./home/README.md)                             | Component Package (Peanut) | Main dashboard entry point.                                                   |
| [`inventory/`](./inventory/README.md)                   | Component Package (Peanut) | Local equipment inventory tracking and status updates.                        |
| [`onboarding/`](./onboarding/README.md)                 | Component Package (Peanut) | Guided product tour with Driver.js.                                           |
| [`orders/`](./orders/README.md)                         | Component Package (Peanut) | Order lists, multi-step creation wizard, and order details.                   |
| [`service-execution/`](./service-execution/README.md)   | Component Package (Peanut) | Mobile technician field portal for checklists, photo capture, and signatures. |
| [`sync/`](./sync/README.md)                             | Component Package (Peanut) | Google Sheets synchronization outbox monitor.                                 |
| [`technical-accounts/`](./technical-accounts/README.md) | Component Package (Peanut) | Shared workshop technician accounts management.                               |
| [`technicians/`](./technicians/README.md)               | Component Package (Peanut) | Technician directory and status views.                                        |
| [`user-management/`](./user-management/README.md)       | Component Package (Peanut) | User CRUD API interactions.                                                   |

## Verification

```bash
pnpm --filter @puk/web test
```
