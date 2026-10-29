# API Resilience Patterns (`apps/api/src/resilience/`)

Fault-tolerance mechanisms including the circuit breaker pattern for external integrations.

## Interface

| Symbol                     | Type  | Description                                                                   |
| -------------------------- | ----- | ----------------------------------------------------------------------------- |
| `CircuitBreaker`           | Class | Manages circuit breaker states (`CLOSED`, `OPEN`, `HALF-OPEN`) using Opossum. |
| `CircuitBreakerOpenError`  | Class | Thrown when operations are attempted during an open circuit.                  |
| `CircuitBreakerSheetsPort` | Class | Decorated Sheets client adapter protected by circuit breaker.                 |

## Invariants

- **State Transitions**: Automatically trips to `OPEN` on consecutive failure threshold and tests recovery in `HALF-OPEN`.
- **Thread Protection**: Fast-fails without queuing requests during external service outages.

## Verification

```bash
pnpm --filter @puk/api test
```
