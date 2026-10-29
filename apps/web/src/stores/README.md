# Web Pinia Stores (`apps/web/src/stores/`)

Global client application state stores for user sessions and visual preferences.

## Interface

| Store             | Description                                                              |
| ----------------- | ------------------------------------------------------------------------ |
| `useSessionStore` | Holds authenticated user state, role, access tokens, and logout actions. |
| `useThemeStore`   | Manages light/dark color scheme toggle persisted in localStorage.        |

## Invariants

- Session store purges memory and cookies on explicit logout or 401 response.

## Verification

```bash
pnpm --filter @puk/web test
```
