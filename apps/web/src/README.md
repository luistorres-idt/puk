# Web Source Blueprint (`apps/web/src/`)

Frontend source root for Bull Dog Solution Single Page Application and Progressive Web Application.

## Subdirectories & Components

| Directory                         | Type                       | Description                                                                    |
| --------------------------------- | -------------------------- | ------------------------------------------------------------------------------ |
| [`app/`](./app/README.md)         | Component Package (Peanut) | Global styling, Tailwind CSS directives, and Naive UI theme token overrides.   |
| [`modules/`](./modules/README.md) | Intermediate Blueprint     | Vertical domain feature slices (orders, execution, inventory, auth, etc.).     |
| [`router/`](./router/README.md)   | Component Package (Peanut) | Vue Router instance, routing table, and role authentication navigation guards. |
| [`shared/`](./shared/README.md)   | Component Package (Peanut) | Reusable components, HTTP Axios client, layouts, and utilities.                |
| [`stores/`](./stores/README.md)   | Component Package (Peanut) | Pinia global state stores (`session`, `theme`).                                |

## Verification

```bash
pnpm --filter @puk/web test
```
