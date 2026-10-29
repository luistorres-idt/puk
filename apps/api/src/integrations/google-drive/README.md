# Google Drive Client Integration (`apps/api/src/integrations/google-drive/`)

Private file storage integration for evidence photos, customer signatures, and PDF reports in Google Shared Drive.

## Interface

| Symbol                | Type  | Description                                                                           |
| --------------------- | ----- | ------------------------------------------------------------------------------------- |
| `GoogleDriveClient`   | Class | Uploads, downloads, and streams private files to/from Google Drive.                   |
| `DriveFolderResolver` | Class | Resolves and caches hierarchical folder structures (`[Client]/[Year-Month]/[Order]`). |

## Invariants

- **Folder Hierarchy**: Files are organized under `[ClientName]/[Year-Month]/[OrderId]`.
- **Private Stream**: All asset retrieval is mediated through authenticated API endpoints; no public share links.

## Verification

```bash
pnpm --filter @puk/api test
```
