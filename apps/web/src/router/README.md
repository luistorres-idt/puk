# Web Router & Navigation Guards (`apps/web/src/router/`)

Vue Router configuration, route hierarchy, and access authorization guards.

## Interface

| Symbol                     | Type     | Description                                                                     |
| -------------------------- | -------- | ------------------------------------------------------------------------------- |
| `router`                   | Object   | Vue Router instance with HTML5 history mode.                                    |
| `reconcileSessionAccess()` | Function | Validates route permissions against active user role (`ADMIN` vs `TECHNICIAN`). |

## Invariants

- **Unauthenticated Redirection**: Protected routes redirect unauthenticated users to `/login`.
- **Role Isolation**: Technicians are restricted from accessing administrative management views.

## Verification

```bash
pnpm --filter @puk/web test
```
