# Contracts Source Package (`packages/contracts/src/`)

Core domain contracts, validation schemas, and business limits shared between `apps/api` and `apps/web`.

## Overview

Acts as the leaf component housing all Valibot runtime validation schemas, TypeScript DTOs, and shared domain rules. Guarantees consistent validation rules between client forms and backend endpoints without runtime coupling to database persistence models.

## Interface

| Module            | File                                                           | Public Symbols                                                                                                                                                                                                             |
| ----------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validation Limits | [`validation-limits.ts`](./validation-limits.ts)               | `MAX_ORDER_NOTES_LENGTH` (5000), `MAX_ORDER_UNITS` (100), `MAX_ORDER_EQUIPMENT` (500), `MAX_IMAGE_PIXELS` (40M), `MAX_ORDER_QUERY_OFFSET` (4,294,967,295), `MIN_UNIT_YEAR` (1900), `getMaxUnitYear()`, `isValidUnitYear()` |
| Authentication    | [`auth.ts`](./auth.ts)                                         | `LoginRequestSchema`, `SessionUserSchema`, `UserRoleSchema`, `OrderAccessModeSchema`, `type LoginRequest`, `type SessionUser`                                                                                              |
| Catalogs          | [`catalogs.ts`](./catalogs.ts)                                 | `ExternalClientSchema`, `ExternalEquipmentSchema`, `CatalogMetadataSchema`, `isMatchingClient()`, `normalizeString()`                                                                                                      |
| Clients           | [`clients.ts`](./clients.ts)                                   | `CreateClientSchema`, `UpdateClientSchema`, `SaveClientEmailSchema`, `ClientEmailSchema`, `ClientSchema`                                                                                                                   |
| Execution         | [`execution.ts`](./execution.ts)                               | `ChecklistCategorySchema`, `ChecklistConditionSchema`, `SaveChecklistItemSchema`, `ReportDiscrepancySchema`, `FailAppointmentSchema`, `MIN_REQUIRED_EVIDENCE_PHOTOS` (10)                                                  |
| Health            | [`health.ts`](./health.ts)                                     | `HealthResponseSchema`, `type HealthResponse`                                                                                                                                                                              |
| Inventory         | [`inventory.ts`](./inventory.ts)                               | `RegisterEquipmentSchema`, `UpdateInventoryEquipmentSchema`, `DeleteInventoryEquipmentSchema`, `initialEquipmentState()`                                                                                                   |
| Orders            | [`orders.ts`](./orders.ts)                                     | `CreateOrderSchema`, `UpdateOrderSchema`, `CreateUnitSchema`, `AssignEquipmentSchema`, `OrderListQuerySchema`, `OrderServiceTypeSchema`, `PricingBreakdownSchema`                                                          |
| Read Models       | [`order-read-models.ts`](./order-read-models.ts)               | `OrderExecutionDetailSchema`, `OrderAdministrationDetailSchema`, `OrderExecutionUnitDetailSchema`, `OrderEvidenceDetailSchema`, `OrderSignatureDetailSchema`                                                               |
| Query Validation  | [`order-query-validation.ts`](./order-query-validation.ts)     | `parseOrderQueryDate()` (leap-year aware ISO 8601 parser)                                                                                                                                                                  |
| Report Email      | [`report-email.ts`](./report-email.ts)                         | `SendReportEmailSchema`, `ReportEmailRecipientsSchema`, `ReportEmailResultSchema`                                                                                                                                          |
| Shared Access     | [`shared-technician-access.ts`](./shared-technician-access.ts) | `SharedTechnicianAccessConfigSchema`, `UpdateSharedTechnicianAccessAccountSchema`, `MeOrderAccessResponseSchema`                                                                                                           |
| Sync              | [`sync.ts`](./sync.ts)                                         | `SyncOperationsQuerySchema`, `SyncOperationTypeSchema`, `UpdateTechnicalReportSyncScheduleSchema`                                                                                                                          |
| Users             | [`users.ts`](./users.ts)                                       | `CreateUserSchema`, `UpdateUserSchema`, `AdminUserListItemSchema`, `CreateTechnicianSchema`, `UpdateTechnicianSchema`                                                                                                      |
| Barrel Entrypoint | [`index.ts`](./index.ts)                                       | Re-exports all public types, schemas, and utility functions.                                                                                                                                                               |

## Invariants

- **String Normalization**: All human-readable strings are trimmed; empty whitespace is rejected on mandatory fields.
- **Dynamic Year Limit**: Vehicle unit years must be between 1900 and current business year + 1 dynamically calculated in `America/Hermosillo`.
- **Capacity Bounds**: Maximum 100 units per order and maximum 500 equipment items across all units in an order.
- **Hardware IMEIs**: IMEIs require exactly 15 numeric digits (`^\d{15}$`) on new registrations and inventory updates.
- **Checklist Integrity**: Exactly 5 unique categories (`DASHBOARD`, `WINDOWS`, `ACCESSORIES`, `TRIMS`, `BODYWORK`). Items marked `BAD` must include non-empty observation notes.
- **Prisma Offset Guard**: Query pagination offsets are guarded against exceeding `4_294_967_295` to avoid silent 32-bit truncation.

## Side Effects

- Pure validation schemas and deterministic helper functions with zero runtime I/O or network requests.

## Verification

```bash
pnpm --filter @puk/contracts test
```
