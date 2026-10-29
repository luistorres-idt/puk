# Execution Module (`apps/api/src/modules/execution/`)

Mobile-first technician field execution: equipment verification, discrepancies, checklists, evidence capture, signatures, and order completion.

## Interface

| Symbol                           | Type     | Description                                                                              |
| -------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `ExecutionService`               | Class    | Manages checklist persistence, discrepancy logging, and evidence attachments.            |
| `OrderFinalizationService`       | Class    | Validates completion rules and transitions order to `COMPLETED` or `FAILED_APPOINTMENT`. |
| `createExecutionRouter(options)` | Function | Mounts execution endpoints under `/api/v1/orders/:id/execution`.                         |

## Invariants

- **Completion Guard**: Normal completion strictly requires: all equipment verified, 5 checklist sections completed, >= 10 photos per unit, and valid customer signature.
- **Failed Appointment Bypass**: Cita fallida (`FAILED_APPOINTMENT`) requires only a reason, bypassing checklist and photographic evidence requirements.

## Verification

```bash
pnpm --filter @puk/api test
```
