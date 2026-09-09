import { createHash } from 'node:crypto';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { parseArgs } from 'node:util';

import dotenv from 'dotenv';
import { google } from 'googleapis';
import {
  ID_COLUMN,
  ID_HEADER,
  MaintenanceError,
  applyPlanToSnapshot,
  planTechnicianIds,
} from './technician-id-plan.mjs';

const SHEET_NAME = 'DIRECTORIO TECNICO';

function normalizePem(value) {
  let result = value.trim();
  if (
    (result.startsWith('"') && result.endsWith('"')) ||
    (result.startsWith("'") && result.endsWith("'"))
  ) {
    result = result.slice(1, -1);
  }
  return result.replaceAll('\\n', '\n').trim();
}

function fingerprint(rows) {
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

function columnLabel(index) {
  let value = index + 1;
  let label = '';
  while (value > 0) {
    value--;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

async function main() {
  const { values } = parseArgs({
    options: {
      'spreadsheet-id': { type: 'string' },
      apply: { type: 'boolean', default: false },
      'expected-fingerprint': { type: 'string' },
    },
  });
  if (!values['spreadsheet-id']) throw new MaintenanceError('SPREADSHEET_ID_REQUIRED');
  if (values.apply && !values['expected-fingerprint']) {
    throw new MaintenanceError('REVIEWED_FINGERPRINT_REQUIRED');
  }

  dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !privateKey || privateKey.startsWith('development-only')) {
    throw new MaintenanceError('GOOGLE_CONFIGURATION_UNAVAILABLE');
  }
  const auth = new google.auth.JWT({
    email,
    key: normalizePem(privateKey),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth, timeout: 30_000 });
  const spreadsheetId = values['spreadsheet-id'];
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties,merges,protectedRanges(range))',
  });
  const sheet = metadata.data.sheets?.find((entry) => entry.properties?.title === SHEET_NAME);
  if (!sheet) throw new MaintenanceError('DIRECTORY_SHEET_NOT_FOUND');
  if (
    sheet.merges?.some(
      (range) =>
        (range.startColumnIndex ?? 0) <= ID_COLUMN &&
        (range.endColumnIndex ?? Infinity) > ID_COLUMN,
    )
  ) {
    throw new MaintenanceError('ID_COLUMN_INTERSECTS_MERGED_CELLS');
  }
  const readRows = async () => {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${SHEET_NAME}'`,
      valueRenderOption: 'FORMULA',
    });
    return response.data.values ?? [];
  };
  const rows = await readRows();
  const headerIndex = rows.findIndex((row) => row[ID_COLUMN] === ID_HEADER);
  if (headerIndex < 0) throw new MaintenanceError('ID_HEADER_NOT_FOUND_IN_W');
  const plan = planTechnicianIds(rows);
  if (values.apply) {
    if (fingerprint(rows) !== values['expected-fingerprint']) {
      throw new MaintenanceError('DIRECTORY_CHANGED_SINCE_INSPECTION');
    }
    const beforeWrite = await readRows();
    if (fingerprint(beforeWrite) !== fingerprint(rows)) {
      throw new MaintenanceError('DIRECTORY_CHANGED_BEFORE_WRITE');
    }
    const expected = applyPlanToSnapshot(rows, plan.changes);
    if (plan.changes.length > 0) {
      await sheets.spreadsheets.values.batchUpdate(
        {
          spreadsheetId,
          requestBody: {
            valueInputOption: 'RAW',
            data: plan.changes.map(({ rowNumber, id }) => ({
              range: `'${SHEET_NAME}'!W${rowNumber}`,
              values: [[id]],
            })),
          },
        },
        { retry: false },
      );
    }
    const after = await readRows();
    if (fingerprint(after) !== fingerprint(expected)) {
      throw new MaintenanceError('POST_WRITE_VERIFICATION_FAILED_REVIEW_REQUIRED');
    }
    const verified = planTechnicianIds(after);
    if (verified.changes.length > 0) throw new MaintenanceError('IDS_STILL_MISSING');
    process.stdout.write(
      JSON.stringify({
        mode: 'applied-and-verified',
        sheet: SHEET_NAME,
        written: plan.changes.length,
        technicians: verified.technicians,
        uniqueIds: verified.existingIds,
        firstAssignedId: plan.changes[0]?.id,
        lastAssignedId: plan.changes.at(-1)?.id,
        firstWrittenRow: plan.changes[0]?.rowNumber,
        lastWrittenRow: plan.changes.at(-1)?.rowNumber,
        otherCellsUnchanged: true,
        fingerprint: fingerprint(after),
      }) + '\n',
    );
    return;
  }
  process.stdout.write(
    JSON.stringify({
      mode: 'inspection',
      sheet: SHEET_NAME,
      headerRow: headerIndex + 1,
      headers: rows[headerIndex].map((value, index) => ({
        column: columnLabel(index),
        header: value,
      })),
      dataRows: rows.length - headerIndex - 1,
      populatedIdCells: rows
        .slice(headerIndex + 1)
        .filter((row) => row[ID_COLUMN] !== undefined && row[ID_COLUMN] !== '').length,
      formulaIdCells: rows
        .slice(headerIndex + 1)
        .filter((row) => typeof row[ID_COLUMN] === 'string' && row[ID_COLUMN].startsWith('='))
        .length,
      mergedRanges: sheet.merges?.length ?? 0,
      protectedRanges: sheet.protectedRanges?.length ?? 0,
      fingerprint: fingerprint(rows),
      plannedIds: plan.changes.length,
      technicians: plan.technicians,
    }) + '\n',
  );
}

main().catch((error) => {
  // Google client errors can contain authorization headers and request payloads.
  // Emit only controlled local codes and HTTP status, never the raw error object.
  process.stderr.write(
    JSON.stringify({
      code: error instanceof MaintenanceError ? error.code : 'GOOGLE_SHEETS_REQUEST_FAILED',
      httpStatus: Number.isInteger(error?.response?.status) ? error.response.status : undefined,
    }) + '\n',
  );
  process.exitCode = 1;
});
