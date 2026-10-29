# Web Inventory Module (`apps/web/src/modules/inventory/`)

Hardware equipment inventory management interface and status tracking.

## Interface

| Component / Composable | Description                                                    |
| ---------------------- | -------------------------------------------------------------- |
| `EquipmentView.vue`    | Searchable table of local equipment stock with status filters. |
| `useInventory()`       | Queries and mutations for local equipment inventory.           |

## Verification

```bash
pnpm --filter @puk/web test
```
