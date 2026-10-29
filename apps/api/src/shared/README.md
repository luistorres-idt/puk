# API Shared Core Utilities (`apps/api/src/shared/`)

Base domain error classes, pagination helpers, and common HTTP utilities.

## Interface

| Symbol                   | Type     | Description                                                                               |
| ------------------------ | -------- | ----------------------------------------------------------------------------------------- |
| `AppError`               | Class    | Standard application error class containing status code, error code, and context payload. |
| `parsePaginationQuery()` | Function | Extracts, sanitizes, and bounds offset and limit query parameters.                        |

## Invariants

- Standardized error codes across all domain modules.

## Verification

```bash
pnpm --filter @puk/api test
```
