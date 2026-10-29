# Web Shared Utilities & Layouts (`apps/web/src/shared/`)

Reusable UI primitives, application shell layouts, HTTP client, and helper utilities.

## Interface

| Component / Utility | Description                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `AppLayout.vue`     | Main application shell containing responsive navigation bar, user menu, and sidebar.       |
| `httpClient`        | Axios instance configured with base URL, token injection, and response error interceptors. |
| `ThemeToggle.vue`   | Button toggling between light and dark modes.                                              |

## Invariants

- Automatically attaches bearer tokens to outbound API calls when user is authenticated.

## Verification

```bash
pnpm --filter @puk/web test
```
