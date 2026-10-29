# Web External Catalogs Module (`apps/web/src/modules/external-catalogs/`)

Reusable dropdown selectors and fuzzy filters for clients and equipment from external Google Sheets.

## Interface

| Component             | Description                                                                   |
| --------------------- | ----------------------------------------------------------------------------- |
| `ClientSelect.vue`    | Client selection dropdown with diacritic-insensitive filtering.               |
| `EquipmentSelect.vue` | Hardware device selector filtering by client, status, and installation state. |

## Verification

```bash
pnpm --filter @puk/web test
```
