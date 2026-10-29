# Web Auth Module (`apps/web/src/modules/auth/`)

User authentication and login views.

## Interface

| Component / Route | Description                                               |
| ----------------- | --------------------------------------------------------- |
| `LoginView.vue`   | Credential form with input validation and error feedback. |
| `authRoutes`      | Route definitions mapping `/login`.                       |

## Verification

```bash
pnpm --filter @puk/web test
```
