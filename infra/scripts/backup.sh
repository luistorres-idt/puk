#!/usr/bin/env bash
set -euo pipefail

# Bull Dog Solution - PostgreSQL Backup Procedure
# Performs consistent logical backup with gzip compression and checksum validation

BACKUP_DIR="${BACKUP_DIR:-/var/backups/postgres}"
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/orders}"
TIMESTAMP=$(date -u +"%Y%m%d_%H%M%SZ")
BACKUP_FILE="${BACKUP_DIR}/bds_db_${TIMESTAMP}.sql.gz"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"

mkdir -p "${BACKUP_DIR}"

echo "Starting PostgreSQL backup at ${TIMESTAMP}..."

# pg_dump with clean DROP/CREATE commands and transactions
pg_dump "${DATABASE_URL}" \
  --format=plain \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  | gzip -9 > "${BACKUP_FILE}"

# Compute SHA256 checksum for integrity verification
sha256sum "${BACKUP_FILE}" > "${CHECKSUM_FILE}"

echo "Backup completed successfully:"
echo "  File: ${BACKUP_FILE} ($(du -h "${BACKUP_FILE}" | cut -f1))"
echo "  Checksum: $(cat "${CHECKSUM_FILE}")"

# Retention policy: retain backups for 30 days
find "${BACKUP_DIR}" -name "bds_db_*.sql.gz*" -mtime +30 -delete
echo "Retention policy applied (older than 30 days removed)."
