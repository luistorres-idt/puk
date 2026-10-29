# Shared Technician Access Module (`apps/api/src/modules/shared-technician-access/`)

Manages configuration for communal workshop technician accounts and multi-order access.

## Interface

| Symbol                                        | Type     | Description                                                                     |
| --------------------------------------------- | -------- | ------------------------------------------------------------------------------- |
| `SharedTechnicianAccessService`               | Class    | Handles workshop account credentials, permissions, and active order visibility. |
| `createSharedTechnicianAccessRouter(options)` | Function | Mounts `/api/v1/shared-technician-access` routes.                               |

## Invariants

- **Optimistic Concurrency**: Uses `revision` field to prevent concurrent overwrites.
- **Assignment Preservation**: Enabling shared access does not modify `Order.technicianId`.

## Verification

```bash
pnpm --filter @puk/api test
```
