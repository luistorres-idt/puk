# Web Styling & Themes (`apps/web/src/app/`)

Global CSS stylesheets, Tailwind CSS layers, and Naive UI design token configuration.

## Interface

| Symbol               | Type   | Description                                                  |
| -------------------- | ------ | ------------------------------------------------------------ |
| `themeOverrides`     | Object | Light mode color palette and typography tokens for Naive UI. |
| `darkThemeOverrides` | Object | Dark mode color overrides.                                   |

## Invariants

- Responsive layout adhering to Tailwind breakpoint grid.
- Dark theme activates on `:root[data-theme='dark']`.

## Verification

```bash
pnpm --filter @puk/web test
```
