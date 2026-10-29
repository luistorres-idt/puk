# ESLint Configuration Package (`packages/eslint-config/`)

Shared ESLint flat configuration and architecture enforcement engine for Bull Dog Solution.

## Interface

| File / Command           | Type          | Description                                                         |
| ------------------------ | ------------- | ------------------------------------------------------------------- |
| [`index.js`](./index.js) | Config Export | Default ESLint flat configuration array defining parsers and rules. |
| `pnpm lint`              | CLI Command   | Executes ESLint across the repository.                              |

## Invariants

- **Application Isolation**: Disallows imports crossing boundaries between `apps/api` and `apps/web`.
- **Package Hierarchy**: Prevents shared packages in `packages/*` from importing application code in `apps/*`.
- **Vertical Slice Encapsulation**: Restricts module imports within an application; external modules must be imported strictly through their public `index.ts`.
- **Logging Discipline**: Enforces `no-console: error` across applications and packages, permitting console logging only in dedicated scripts under `infra/scripts` and `scripts/`.

## Side Effects

- Emits lint errors and warnings during static analysis in local runs and CI pipelines.

## Verification

```bash
pnpm lint
```
