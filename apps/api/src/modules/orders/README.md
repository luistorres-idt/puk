# Orders Module (`apps/api/src/modules/orders/`)

Service order management: lifecycle state machine, unit/equipment allocation, pricing engine, and outbox sync.

## Interface

| Symbol                        | Type     | Description                                                            |
| ----------------------------- | -------- | ---------------------------------------------------------------------- |
| `OrdersService`               | Class    | Aggregate service managing order creation, updates, and transitions.   |
| `OrderPricingService`         | Class    | Arbitrary precision pricing calculator with audit trail.               |
| `SyncService`                 | Class    | Manages Google Sheets outbox mutations and background worker triggers. |
| `createOrdersRouter(options)` | Function | Mounts `/api/v1/orders` endpoints.                                     |

## Invariants

- **State Machine Transitions**: Strictly enforces `DRAFT -> ASSIGNED -> IN_PROGRESS -> COMPLETED / FAILED_APPOINTMENT / REQUIRES_CORRECTION / CANCELLED`.
- **Immutability on Completion**: Orders in `COMPLETED` state cannot be cancelled or deleted.
- **Asynchronous Outbox**: Changes to assigned or completed orders enqueue outbox events for Sheets synchronization.

## Verification

```bash
pnpm --filter @puk/api test
```
