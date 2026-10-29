# Gmail Client Integration (`apps/api/src/integrations/gmail/`)

Google Gmail API client for sending PDF service report emails via domain-wide delegation.

## Interface

| Symbol                   | Type      | Description                                                                 |
| ------------------------ | --------- | --------------------------------------------------------------------------- |
| `GmailClient`            | Class     | Authenticates with Google APIs and sends RFC 2822 multipart emails.         |
| `SendReportEmailOptions` | Interface | Options including recipient emails, subject, body, and attached PDF stream. |

## Invariants

- **Domain Delegation**: Authenticates via Google Service Account JWT impersonating `senderEmail`.
- **Manual Trigger**: Invoked solely upon explicit manual administrative request; never sends emails automatically.

## Verification

```bash
pnpm --filter @puk/api test
```
