# Web Orders Module (`apps/web/src/modules/orders/`)

Comprehensive order management interface: lists, multi-step creation wizard, unit configuration, and pricing.

## Interface

| Component / Composable      | Description                                                             |
| --------------------------- | ----------------------------------------------------------------------- |
| `OrdersListView.vue`        | Paginated and filtered service orders table.                            |
| `OrderCreateWizardView.vue` | 5-step wizard for preparing multiservice orders and units.              |
| `OrderDetailView.vue`       | Complete order view with audit tabs, discrepancy logs, and sync status. |
| `useOrders()`               | TanStack Query composables for orders API.                              |

## Invariants

- **Wizard Validation**: All required steps must validate before submission.
- **Cancelled Order Filtering**: Cancelled orders are hidden by default from active operational lists.

## Verification

```bash
pnpm --filter @puk/web test
```
