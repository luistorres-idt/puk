# Reports Module (`apps/api/src/modules/reports/`)

PDF generation for completed service orders, private Google Drive storage, and manual Gmail delivery.

## Interface

| Symbol                         | Type     | Description                                                                          |
| ------------------------------ | -------- | ------------------------------------------------------------------------------------ |
| `ReportsService`               | Class    | Compiles branded PDF reports containing checklists, photo galleries, and signatures. |
| `ReportEmailService`           | Class    | Dispatches generated PDF reports via Gmail API.                                      |
| `createReportsRouter(options)` | Function | Mounts `/api/v1/orders/:id/report` endpoints.                                        |

## Invariants

- **Storage**: Generated PDFs are persisted in Google Shared Drive.
- **Manual Delivery**: Reports are sent via email only upon explicit manual administrative request.

## Verification

```bash
pnpm --filter @puk/api test
```
