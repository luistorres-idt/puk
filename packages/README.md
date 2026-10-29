# Shared Packages Blueprint (`packages/`)

Intermediate architectural blueprint grouping foundational shared libraries, compilation targets, and configurations consumed across the Bull Dog Solution monorepo.

## Subdirectories & Components

| Directory                                                | Type                       | Description                                                              | Verification Command                |
| -------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------ | ----------------------------------- |
| [`contracts/`](./contracts/README.md)                    | Component Package (Peanut) | Shared Valibot schemas, DTOs, domain limits, and typed interfaces.       | `pnpm --filter @puk/contracts test` |
| [`eslint-config/`](./eslint-config/README.md)            | Component Package (Peanut) | ESLint flat configuration enforcing monorepo architectural boundaries.   | `pnpm lint`                         |
| [`typescript-config/`](./typescript-config/package.json) | Configuration Preset       | Reusable `tsconfig` base configs (`base.json`, `node.json`, `vue.json`). | `pnpm typecheck`                    |

## Monorepo Architectural Boundary Invariants

- **Inward Dependency Flow**: Applications (`apps/*`) and infrastructure stacks (`infra/*`) depend on `packages/*`. Packages never import from applications.
- **Compilation Lifecycle**: `@puk/contracts` compiles to JavaScript and declaration files in `dist/` before running application development or testing commands.
- **Strict Modules**: All packages use ES modules (`"type": "module"`).

## Verification

```bash
pnpm --filter @puk/contracts test
```
