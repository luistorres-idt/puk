# Web Service Execution Module (`apps/web/src/modules/service-execution/`)

Mobile-first technician field portal for checklists, photo capture, customer signatures, and service finalization.

## Interface

| Component / Composable         | Description                                                      |
| ------------------------------ | ---------------------------------------------------------------- |
| `OrderExecutionView.vue`       | Mobile checklist, photo gallery capture, and signature pad.      |
| `SharedTechnicianHomeView.vue` | Portal view for communal workshop tablet mode.                   |
| `useExecutionNotes()`          | Reactive state managing execution notes before order completion. |

## Invariants

- **Field Rules**: Validates >= 10 photos per unit and complete checklist items before enabling closure button.

## Verification

```bash
pnpm --filter @puk/web test
```
