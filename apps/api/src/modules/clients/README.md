# Clients Module (`apps/api/src/modules/clients/`)

Manages local client records and email distribution lists for service reports.

## Interface

| Symbol                                        | Type     | Description                                                           |
| --------------------------------------------- | -------- | --------------------------------------------------------------------- |
| `ClientsService`                              | Class    | Database service managing client details and email recipient records. |
| `createClientsRouter(service, requireAccess)` | Function | Mounts `/api/v1/clients` endpoints.                                   |

## Invariants

- **Email Validation**: Client emails must conform to RFC standards before persistence in `ClientEmail`.
- **Unique Recipients**: Enforces uniqueness per client.

## Verification

```bash
pnpm --filter @puk/api test
```
