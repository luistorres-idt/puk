#!/usr/bin/env bash
set -euo pipefail

# Bull Dog Solution - PostgreSQL Restore & Disaster Recovery Procedure
# Restores and verifies a gzipped SQL backup into target database

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <path_to_backup_file.sql.gz>"
  exit 1
fi

BACKUP_FILE="$1"
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/orders}"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Error: Backup file not found at ${BACKUP_FILE}"
  exit 1
fi

if [ -f "${CHECKSUM_FILE}" ]; then
  echo "Verifying SHA256 checksum..."
  sha256sum --check "${CHECKSUM_FILE}"
  echo "Checksum verified."
else
  echo "Warning: No checksum file found, proceeding with caution..."
fi

echo "Starting restoration to database..."
gunzip -c "${BACKUP_FILE}" | psql "${DATABASE_URL}" --single-transaction --set ON_ERROR_STOP=1

echo "Restoration completed successfully."

# Verification query
echo "Verifying restored tables..."
psql "${DATABASE_URL}" -c "SELECT count(*) AS total_orders FROM \"Order\";"
echo "Database ready."
