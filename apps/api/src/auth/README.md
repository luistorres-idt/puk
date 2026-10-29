# API Authentication & Capabilities (`apps/api/src/auth/`)

JWT-based authentication, EdDSA signature verification, cookie handling, role capability checks, and active session resolution via PostgreSQL.

## Interface

| Symbol                             | Type       | Description                                                                          |
| ---------------------------------- | ---------- | ------------------------------------------------------------------------------------ |
| `authenticate(tokens, principals)` | Middleware | Extracts Bearer token or cookie, verifies EdDSA signature, and resolves active user. |
| `authorize(capability)`            | Middleware | Enforces required role capabilities before granting endpoint access.                 |
| `TokenService`                     | Class      | Issues and verifies Ed25519 access and refresh tokens.                               |
| `hasCapability(role, capability)`  | Function   | Determines if role has permission for given action.                                  |
| `PrismaPrincipalResolver`          | Class      | Resolves active user account and checks revocation status.                           |

## Invariants

- **Ed25519 Signatures**: Access tokens are signed using Ed25519 (EdDSA) with claims `sub`, `role`, and `type='access'`.
- **Session Revocation**: Refresh tokens contain a UUID `jti`, hashed with SHA-256 for persistent database revocation tracking.
- **Active Principal Verification**: Every authenticated request verifies that the user is active in PostgreSQL.
- **Failure Status**: Fails with 401 UNAUTHENTICATED on missing/invalid token and 401 SESSION_REVOKED if user is inactive.

## Side Effects

- Verifies cryptographic signatures and queries PostgreSQL `User` and `RefreshToken` tables.

## Verification

```bash
pnpm --filter @puk/api test
```
