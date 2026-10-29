# Infrastructure Scripts (`infra/scripts/`)

Operational automation scripts for database migration, backup, restore, secret provisioning, staging environment loading, and smoke/E2E testing.

## Interface

| Script                                                             | Type           | Description                                                                                                              |
| ------------------------------------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [`backup.sh`](./backup.sh)                                         | Shell Script   | Logical PostgreSQL backup using `pg_dump` with gzip compression (`-9`), SHA-256 checksums, and 30-day retention pruning. |
| [`restore.sh`](./restore.sh)                                       | Shell Script   | PostgreSQL disaster recovery restore script; validates SHA-256 checksum and executes in single transaction.              |
| [`migrate.sh`](./migrate.sh)                                       | Shell Script   | Runs `pnpm prisma:validate` followed by `pnpm prisma migrate deploy`.                                                    |
| [`configure-staging-secrets.mjs`](./configure-staging-secrets.mjs) | Node.js Script | Provisions `puk/staging/runtime` in AWS Secrets Manager with generated Ed25519 keys and seed passwords.                  |
| [`with-staging-env.mjs`](./with-staging-env.mjs)                   | Node.js Script | Loads non-secret staging environment variables from root `.env` before executing child processes.                        |
| [`smoke-test.sh`](./smoke-test.sh)                                 | Shell Script   | Tests `/health/live`, `/health/ready`, and verifies `/metrics` is protected from public internet.                        |
| [`e2e-test.sh`](./e2e-test.sh)                                     | Shell Script   | 4-tier opaque-box E2E test runner supporting live endpoints or local high-fidelity `--mock` mode.                        |

## Invariants

- **Secret Leakage Prevention**: `configure-staging-secrets.mjs` never prints secrets to stdout/stderr; temporary files are created with `0600` permissions.
- **Overwrite Protection**: Refuses to overwrite existing Secrets Manager secret unless explicitly passed `--overwrite`.
- **Atomic Restores**: `restore.sh` applies SQL dumps in a single transaction with `ON_ERROR_STOP=1`.
- **Metrics Privacy**: Deployment smoke tests strictly assert that `/metrics` returns 404 on the public web port.

## Side Effects

- Reads and writes local backup `.sql.gz` archives in `BACKUP_DIR`.
- Interacts with AWS Secrets Manager via AWS CLI or SDK.
- Restores data directly into PostgreSQL instances.

## Verification

```bash
pnpm infra:test
```
