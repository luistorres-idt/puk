# API External Integrations Blueprint (`apps/api/src/integrations/`)

Abstracts external Google Workspace cloud services (Drive, Sheets, Gmail) through domain ports.

## Subdirectories & Components

| Directory                                     | Type                       | Description                                                                       |
| --------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------- |
| [`gmail/`](./gmail/README.md)                 | Component Package (Peanut) | Outbound email delivery via Google Gmail API domain-wide delegation.              |
| [`google-drive/`](./google-drive/README.md)   | Component Package (Peanut) | Private asset storage for photos, signatures, and PDFs in Google Shared Drive.    |
| [`google-sheets/`](./google-sheets/README.md) | Component Package (Peanut) | External catalog queries, local caching, and outbox-driven spreadsheet mutations. |

## Interface

| File                     | Description                                               |
| ------------------------ | --------------------------------------------------------- |
| [`ports.ts`](./ports.ts) | Domain interfaces decoupled from third-party vendor SDKs. |

## Verification

```bash
pnpm --filter @puk/api test
```
