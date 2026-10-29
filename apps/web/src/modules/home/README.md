# Web Home Module (`apps/web/src/modules/home/`)

Landing dashboard and role-based redirect views.

## Interface

| Component / Route | Description                                                                |
| ----------------- | -------------------------------------------------------------------------- |
| `HomeView.vue`    | Main dashboard displaying metrics and shortcuts based on user permissions. |
| `homeRoutes`      | Route definitions mapping `/` to home view.                                |

## Verification

```bash
pnpm --filter @puk/web test
```
