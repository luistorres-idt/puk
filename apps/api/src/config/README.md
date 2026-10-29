# API Environment Configuration (`apps/api/src/config/`)

Environment variable loading, type coercion, and strict schema validation using Valibot.

## Interface

| Symbol              | Type     | Description                                                                 |
| ------------------- | -------- | --------------------------------------------------------------------------- |
| `loadEnvironment()` | Function | Loads and validates runtime environment variables.                          |
| `EnvironmentSchema` | Schema   | Valibot validation schema defining all required and optional API variables. |

## Invariants

- **Fail-Fast**: Execution halts immediately at startup if critical variables (`DATABASE_URL`, `JWT_ACCESS_PRIVATE_KEY`, etc.) fail validation.
- **Key Normalization**: Automatically normalizes newline characters in multi-line PEM keys.

## Verification

```bash
pnpm --filter @puk/api test
```
