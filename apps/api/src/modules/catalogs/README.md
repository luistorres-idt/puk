# Catalogs Module (`apps/api/src/modules/catalogs/`)

Endpoints for querying external client and equipment catalogs with in-memory caching.

## Interface

| Symbol                          | Type     | Description                                                                   |
| ------------------------------- | -------- | ----------------------------------------------------------------------------- |
| `createCatalogsRouter(options)` | Function | Mounts `/clients` and `/equipment` search endpoints under `/api/v1/catalogs`. |

## Invariants

- **Cached Projections**: Catalog reads are cached according to `CATALOG_CACHE_TTL_SECONDS`.
- **Diacritic Normalization**: Uses normalized client strings for reliable searching.

## Verification

```bash
pnpm --filter @puk/api test
```
