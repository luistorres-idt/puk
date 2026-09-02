import { google, type sheets_v4 } from 'googleapis';
import type { ExternalClientRecord, ExternalEquipmentRecord, SheetsPort } from '../ports.js';
import { parseEquipmentRow } from './equipment-identity.js';

export interface GoogleSheetsClientConfig {
  spreadsheetId: string;
  clientsSheetName: string;
  equipmentSheetName: string;
  clientEmail: string;
  privateKey: string;
  timeoutMs?: number;
}

export class GoogleSheetsClient implements SheetsPort {
  private readonly sheets: sheets_v4.Sheets;
  private readonly spreadsheetId: string;
  private readonly clientsSheetName: string;
  private readonly equipmentSheetName: string;

  public constructor(config: GoogleSheetsClientConfig) {
    this.spreadsheetId = config.spreadsheetId;
    this.clientsSheetName = config.clientsSheetName;
    this.equipmentSheetName = config.equipmentSheetName;

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
    values: Readonly<Partial<Record<'J' | 'L' | 'M' | 'N' | 'O' | 'P', string>>>;
  }): Promise<void> {
    const data: Array<{ range: string; values: string[][] }> = [];

    const allowedCols: ReadonlyArray<'J' | 'L' | 'M' | 'N' | 'O' | 'P'> = [
      'J',
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
}
