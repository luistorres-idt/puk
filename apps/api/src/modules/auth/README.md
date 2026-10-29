# Auth Module (`apps/api/src/modules/auth/`)

Authentication endpoints: login, session refresh, logout, password updates, and current principal query.

## Interface

| Symbol                      | Type     | Description                                                                      |
| --------------------------- | -------- | -------------------------------------------------------------------------------- |
| `createAuthRouter(options)` | Function | Mounts `/login`, `/refresh`, `/logout`, `/me`, and `/password` routes.           |
| `AuthService`               | Class    | Manages user authentication, Argon2id password verification, and token rotation. |

## Invariants

- **Secure Cookies**: Refresh tokens are stored in secure HTTP-only cookies.
- **Rotation & Revocation**: Refresh tokens rotate upon successful refresh; invalidates tokens on logout.

## Verification

```bash
pnpm --filter @puk/api test
```
