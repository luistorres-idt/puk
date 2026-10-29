# Administration Module (`apps/api/src/modules/administration/`)

Unified administration router coordinating user management, technician directory, sync outbox processing, and report schedules.

## Interface

| Symbol                                | Type     | Description                                                   |
| ------------------------------------- | -------- | ------------------------------------------------------------- |
| `createAdministrationRouter(options)` | Function | Mounts protected admin routes under `/api/v1/administration`. |

## Invariants

- **Capability Enforcement**: All endpoints strictly require the `ADMIN` capability.
- **Dependency Aggregation**: Injects dependencies across user, technician, and synchronization services.

## Verification

```bash
pnpm --filter @puk/api test
```
