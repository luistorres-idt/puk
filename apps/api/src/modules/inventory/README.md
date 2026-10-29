# Inventory Module (`apps/api/src/modules/inventory/`)

Local equipment inventory tracking, reservation during order drafting, status transitions, and conflict detection.

## Interface

| Symbol                                          | Type      | Description                                                          |
| ----------------------------------------------- | --------- | -------------------------------------------------------------------- |
| `InventoryService`                              | Class     | Manages local inventory hardware records and lifecycle transitions.  |
| `HybridEquipmentCatalog`                        | Class     | Combines Sheets external catalog and local PostgreSQL inventory.     |
| `reserveInventory()`, `releaseOrderInventory()` | Functions | Atomic inventory reservation and release within Prisma transactions. |
| `createInventoryRouter(service, requireAccess)` | Function  | Mounts `/api/v1/inventory` endpoints.                                |

## Invariants

- **Atomic Reservation**: Equipment items are locked within transactions during assignment to prevent double-booking.
- **Automatic Release**: Cancelling or deleting an uncompleted order immediately returns reserved equipment to stock.

## Verification

```bash
pnpm --filter @puk/api test
```
