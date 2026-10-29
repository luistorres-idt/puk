# API Operational Scripts (`apps/api/scripts/`)

Utility and maintenance CLI scripts for backend service operations.

## Interface

| Script                      | Description                                                                |
| --------------------------- | -------------------------------------------------------------------------- |
| `assign-technician-ids.mjs` | Migration helper assigning internal UUIDs to technician directory records. |
| `technician-id-plan.mjs`    | Generates execution plan for technician ID migrations.                     |

## Invariants

- Executes within Node.js with environment variables loaded.

## Verification

```bash
pnpm --filter @puk/api test
```
