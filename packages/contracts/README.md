# Contracts Package (`packages/contracts/`)

Shared domain contracts, data transfer objects, and Valibot validation schemas for the Bull Dog Solution monorepo.

## Subdirectories & Components

| Subdirectory / File                            | Type                       | Description                                                                            |
| ---------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------- |
| [`src/`](./src/README.md)                      | Component Package (Peanut) | Leaf package source code containing domain validation schemas, DTOs, and pure helpers. |
| [`package.json`](./package.json)               | Manifest                   | Declares ESM module exports mapping `.` to `dist/index.js` and `dist/index.d.ts`.      |
| [`tsconfig.build.json`](./tsconfig.build.json) | Configuration              | Dedicated TypeScript compiler configuration emitting declarations to `dist/`.          |

## Interface

| Export / Command                     | Type           | Description                                                       |
| ------------------------------------ | -------------- | ----------------------------------------------------------------- |
| `@puk/contracts`                     | Package Export | Exposes compiled validation schemas, types, and domain constants. |
| `pnpm --filter @puk/contracts build` | CLI Command    | Compiles TypeScript sources to `dist/`.                           |
| `pnpm --filter @puk/contracts test`  | CLI Command    | Runs Vitest regression suite.                                     |

## Invariants

- **Compilation Prerequisite**: Must be compiled with `tsc -p tsconfig.build.json` before running `apps/api` or `apps/web`.
- **Workspace Encapsulation**: Depends solely on `valibot`; never imports from `apps/*`.
- **Isomorphic Execution**: Compatible with both browser (Vite/Vue 3) and Node.js (Express 5) runtimes.

## Side Effects

- Compiles JavaScript and type declaration files to `dist/` upon build.

## Verification

```bash
pnpm --filter @puk/contracts test
```
