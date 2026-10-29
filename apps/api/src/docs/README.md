# API OpenAPI Documentation (`apps/api/src/docs/`)

OpenAPI 3.1 schema specification derivation and Swagger UI integration.

## Interface

| Symbol                      | Type     | Description                                                  |
| --------------------------- | -------- | ------------------------------------------------------------ |
| `openApiDocument`           | Object   | Compiled OpenAPI 3.1 schema specification.                   |
| `buildOpenApiDocument()`    | Function | Generates `openapi.json` from `@puk/contracts` schemas.      |
| `validateOpenApiDocument()` | Function | Validates generated schema against API routes and contracts. |

## Invariants

- **Single Source of Truth**: Converts Valibot schemas from `@puk/contracts` into standard JSON Schema representations via `@valibot/to-json-schema`.
- **Validation Discipline**: Build and validation scripts fail if schemas are out of sync with contract definitions.

## Verification

```bash
pnpm --filter @puk/api docs:validate
```
