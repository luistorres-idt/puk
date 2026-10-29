# Web Sync Operations Module (`apps/web/src/modules/sync/`)

Operational dashboard for inspecting Google Sheets synchronization outbox entries and managing retries.

## Interface

| Component                | Description                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `SyncOperationsView.vue` | Dashboard displaying outbox synchronization jobs, errors, and manual retry buttons. |

## Verification

```bash
pnpm --filter @puk/web test
```
