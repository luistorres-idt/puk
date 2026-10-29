# Google Sheets Integration (`apps/api/src/integrations/google-sheets/`)

Google Sheets API client and catalog synchronization services for equipment and client directories.

## Interface

| Symbol                       | Type  | Description                                                                     |
| ---------------------------- | ----- | ------------------------------------------------------------------------------- |
| `GoogleSheetsClient`         | Class | Executes batch get and update operations against Google Sheets spreadsheets.    |
| `DevMockSheetsClient`        | Class | In-memory mock used during local development when credentials are placeholders. |
| `GoogleSheetsCatalogService` | Class | Queries and caches client and equipment catalogs with TTL expiration.           |

## Invariants

- **Resilience**: Wrapped with a circuit breaker to prevent cascading thread pool exhaustion upon Google API failures.
- **Outbox Sync**: Write operations are asynchronously processed through the database outbox.

## Verification

```bash
pnpm --filter @puk/api test
```
