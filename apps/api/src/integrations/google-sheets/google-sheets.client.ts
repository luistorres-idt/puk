import { google, type sheets_v4 } from 'googleapis';
import type {
  ExternalClientRecord,
  ExternalEquipmentRecord,
  SheetsPort,
  TechnicalReportRowInput,
} from '../ports.js';
import { parseEquipmentRow } from './equipment-identity.js';
import { AppError } from '../../shared/errors.js';

export interface GoogleSheetsClientConfig {
  spreadsheetId: string;
  clientsSheetName: string;
  equipmentSheetName: string;
  techniciansSheetName?: string;
  reportsSheetName?: string;
  clientEmail: string;
  privateKey: string;
  timeoutMs?: number;
}

export class GoogleSheetsClient implements SheetsPort {
  private readonly sheets: sheets_v4.Sheets;
  private readonly spreadsheetId: string;
  private readonly clientsSheetName: string;
  private readonly equipmentSheetName: string;
  private readonly techniciansSheetName: string;
  private readonly reportsSheetName: string;

  public constructor(config: GoogleSheetsClientConfig) {
    this.spreadsheetId = config.spreadsheetId;
    this.clientsSheetName = config.clientsSheetName;
    this.equipmentSheetName = config.equipmentSheetName;
    this.techniciansSheetName = config.techniciansSheetName ?? 'DIRECTORIO TECNICO';
    this.reportsSheetName = config.reportsSheetName ?? '2026';

    const auth = new google.auth.JWT({
      email: config.clientEmail,
      key: config.privateKey.replaceAll('\\n', '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheets = google.sheets({
      version: 'v4',
      auth,
      timeout: config.timeoutMs ?? 15_000,
    });
  }

  public async listClients(): Promise<readonly ExternalClientRecord[]> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.clientsSheetName}!A2:B`,
    });

    const rows = response.data.values ?? [];
    const clients: ExternalClientRecord[] = [];

    for (const row of rows) {
      const id = row[0]?.toString().trim();
      const name = row[1]?.toString().trim();
      if (id && name) {
        clients.push({ externalId: id, name });
      }
    }

    return clients;
  }

  public async listEquipment(): Promise<readonly ExternalEquipmentRecord[]> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.equipmentSheetName}!A2:P`,
    });

    const rows = response.data.values ?? [];
    const records: ExternalEquipmentRecord[] = [];

    for (let index = 0; index < rows.length; index++) {
      const rowValues = (rows[index] ?? []).map((val) => (val ?? '').toString());
      const rowNumber = index + 2; // Row 1 is header
      const parsed = parseEquipmentRow(rowValues, rowNumber);

      records.push({
        externalId: parsed.id ?? '',
        imei: parsed.imei ?? '',
        row: rowNumber,
        values: parsed.rawValues,
      });
    }

    return records;
  }

  public async findEquipment(identity: {
    externalId: string;
    imei: string;
  }): Promise<ExternalEquipmentRecord | null> {
    const list = await this.listEquipment();
    for (const record of list) {
      if (
        (identity.externalId && record.externalId === identity.externalId) ||
        (identity.imei && record.imei === identity.imei)
      ) {
        return record;
      }
    }
    return null;
  }

  public async updateAssignment(input: {
    row: number;
    values: Readonly<Partial<Record<'J' | 'K' | 'L' | 'M' | 'N' | 'O' | 'P', string>>>;
  }): Promise<void> {
    const data: Array<{ range: string; values: string[][] }> = [];

    const allowedCols: ReadonlyArray<'J' | 'K' | 'L' | 'M' | 'N' | 'O' | 'P'> = [
      'J',
      'K',
      'L',
      'M',
      'N',
      'O',
      'P',
    ];

    for (const col of allowedCols) {
      if (input.values[col] !== undefined) {
        data.push({
          range: `${this.equipmentSheetName}!${col}${input.row}`,
          values: [[input.values[col]!]],
        });
      }
    }

    if (data.length === 0) {
      return;
    }

    await this.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data,
      },
    });
  }

  public async listTechniciansDirectory(): Promise<readonly (readonly string[])[]> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `'${this.techniciansSheetName}'!A1:W`,
      valueRenderOption: 'FORMATTED_VALUE',
    });
    const rows = response.data.values ?? [];
    return rows.map((r) => r.map((c) => (c === null || c === undefined ? '' : String(c))));
  }

  public async syncTechnicalReportRow(
    input: TechnicalReportRowInput,
  ): Promise<{ row: number; created: boolean }> {
    const range = `'${this.reportsSheetName}'!A1:P`;
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range,
    });
    const rows = response.data.values ?? [];
    if (rows.length === 0) {
      throw new AppError(400, 'REPORT_EMPTY', 'La hoja de reporte técnico está vacía');
    }

    const header = rows[0] ?? [];
    if (
      (header[0] ?? '').toString().trim().toLowerCase() !== 'sem' ||
      (header[1] ?? '').toString().trim().toLowerCase() !== 'orden' ||
      (header[2] ?? '').toString().trim().toLowerCase() !== 'tecnico' ||
      (header[14] ?? '').toString().trim().toLowerCase() !== 'envio dhl'
    ) {
      throw new AppError(
        400,
        'REPORT_HEADERS_INVALID',
        'Los encabezados de la hoja de reporte técnico no coinciden con el contrato esperado',
      );
    }

    const matchingRows: number[] = [];
    for (let i = 1; i < rows.length; i++) {
      const rowFolio = (rows[i]?.[1] ?? '').toString().trim();
      if (rowFolio === input.folio) {
        matchingRows.push(i + 1); // 1-based row number
      }
    }

    if (matchingRows.length > 1) {
      throw new AppError(
        409,
        'DUPLICATE_FOLIO_IN_REPORT',
        `El folio ${input.folio} aparece duplicado en el reporte técnico en las filas ${matchingRows.join(', ')}`,
        { folio: input.folio, rows: matchingRows },
      );
    }

    const targetRow = matchingRows.length === 1 ? matchingRows[0]! : rows.length + 1;
    const isUpdate = matchingRows.length === 1;

    // Capture previous unmanaged values if update
    const prevRow = isUpdate ? (rows[targetRow - 1] ?? []) : [];
    const prevD = (prevRow[3] ?? '').toString();
    const prevE = (prevRow[4] ?? '').toString();
    const prevO = (prevRow[14] ?? '').toString();

    // Write ONLY managed columns: A:C, F:N, P
    const batchData = [
      {
        range: `'${this.reportsSheetName}'!A${targetRow}:C${targetRow}`,
        values: [[input.sem, input.folio, input.tecnico]],
      },
      {
        range: `'${this.reportsSheetName}'!F${targetRow}:N${targetRow}`,
        values: [[
          input.economico,
          input.serie,
          input.imeiId,
          input.cliente,
          input.fecha,
          input.servicio,
          input.costo,
          input.viaticos,
          input.total,
        ]],
      },
      {
        range: `'${this.reportsSheetName}'!P${targetRow}`,
        values: [[input.notas]],
      },
    ];

    await this.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: batchData,
      },
    });

    // Re-read row after write to verify identity and confirm unmanaged cells remain intact
    const verifyRes = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `'${this.reportsSheetName}'!A${targetRow}:P${targetRow}`,
    });
    const afterRow = verifyRes.data.values?.[0] ?? [];
    if ((afterRow[1] ?? '').toString().trim() !== input.folio) {
      throw new AppError(
        500,
        'REPORT_VERIFICATION_FAILED',
        'La fila escrita no contiene el folio esperado tras la verificación',
      );
    }
    if (isUpdate) {
      const afterD = (afterRow[3] ?? '').toString();
      const afterE = (afterRow[4] ?? '').toString();
      const afterO = (afterRow[14] ?? '').toString();
      if (afterD !== prevD || afterE !== prevE || afterO !== prevO) {
        throw new AppError(
          500,
          'UNMANAGED_CELLS_MODIFIED',
          'Las celdas manuales no administradas fueron modificadas durante la escritura',
        );
      }
    }

    return { row: targetRow, created: !isUpdate };
  }
}
