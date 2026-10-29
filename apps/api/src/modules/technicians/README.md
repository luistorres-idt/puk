# Technicians Module (`apps/api/src/modules/technicians/`)

Technician directory synchronization from Google Sheets and assignment management.

## Interface

| Symbol               | Type  | Description                                                           |
| -------------------- | ----- | --------------------------------------------------------------------- |
| `TechniciansService` | Class | Synchronizes technician listings from the `DIRECTORIO TECNICO` sheet. |

## Invariants

- **Idempotence**: Synchronization can be triggered repeatedly without duplicate records.

## Verification

```bash
pnpm --filter @puk/api test
```
