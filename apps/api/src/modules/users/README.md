# Users Module (`apps/api/src/modules/users/`)

Administration user CRUD, credential updates, and account status management.

## Interface

| Symbol         | Type  | Description                                                              |
| -------------- | ----- | ------------------------------------------------------------------------ |
| `UsersService` | Class | Handles administrator user creation, password changes, and deactivation. |

## Invariants

- **Unique Email**: User emails are unique in PostgreSQL.
- **Admin Safeguard**: Prevents deletion or deactivation of the last active administrator account.

## Verification

```bash
pnpm --filter @puk/api test
```
