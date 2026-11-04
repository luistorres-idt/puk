import { beforeEach, describe, expect, it, vi } from 'vitest';

const googleApi = vi.hoisted(() => ({
  getSpreadsheet: vi.fn(),
  getValues: vi.fn(),
  updateSpreadsheet: vi.fn(),
  updateValues: vi.fn(),
}));

vi.mock('googleapis', () => ({
  google: {
    auth: { JWT: vi.fn() },
    sheets: vi.fn(() => ({
      spreadsheets: {
        get: googleApi.getSpreadsheet,
        batchUpdate: googleApi.updateSpreadsheet,
        values: {
          get: googleApi.getValues,
          batchUpdate: googleApi.updateValues,
        },
      },
    })),
  },
}));

import type { TechnicalReportRowInput } from '../ports.js';
import { GoogleSheetsClient } from './google-sheets.client.js';

const reportRow: TechnicalReportRowInput = {
  folio: 'OS-002',
  sem: '37',
  tecnico: 'Técnico Dos',
  economico: 'ECO-002',
  serie: 'SER-002',
  imeiId: 'IMEI-002',
  cliente: 'Cliente Dos',
  fecha: '2026-09-09',
  servicio: 'Revisión',
  costo: '500.00',
  viaticos: '0.00',
  total: '500.00',
  notas: '',
};

describe('GoogleSheetsClient technical report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts a new report at row 2 in the technicians workbook', async () => {
    googleApi.getValues
      .mockResolvedValueOnce({
        data: {
          values: [
            [
              'sem',
              'orden',
              'tecnico',
              'nombre',
              'rfc',
              'economico',
              'serie',
              'imei/id',
              '',
              'fecha',
              'servicio',
              'costo',
              'viaticos',
              'total',
              'envio dhl',
              'notas',
            ],
            ['36', 'OS-001'],
          ],
        },
      })
      .mockResolvedValueOnce({ data: { values: [['37', 'OS-002']] } });
    googleApi.getSpreadsheet.mockResolvedValue({
      data: {
        sheets: [
          {
            properties: {
              sheetId: 456,
              title: '2026',
              gridProperties: { rowCount: 100 },
            },
          },
        ],
      },
    });
    googleApi.updateSpreadsheet.mockResolvedValue({});
    googleApi.updateValues.mockResolvedValue({});

    const client = new GoogleSheetsClient({
      spreadsheetId: 'catalog-workbook',
      techniciansSpreadsheetId: 'technicians-workbook',
      clientsSheetName: 'Clientes',
      equipmentSheetName: 'SALIDAS',
      reportsSheetName: '2026',
      clientEmail: 'service-account@example.invalid',
      privateKey: 'private-key',
    });

    await expect(client.syncTechnicalReportRow(reportRow)).resolves.toEqual({
      row: 3,
      created: true,
    });

    expect(googleApi.getSpreadsheet).toHaveBeenCalledWith({
      spreadsheetId: 'technicians-workbook',
      fields: 'sheets(properties(sheetId,title,gridProperties(rowCount)))',
    });
    expect(googleApi.updateSpreadsheet).not.toHaveBeenCalled();
    expect(googleApi.updateValues).toHaveBeenCalledWith(
      expect.objectContaining({
        spreadsheetId: 'technicians-workbook',
        requestBody: expect.objectContaining({
          data: [
            expect.objectContaining({ range: "'2026'!A3:C3" }),
            expect.objectContaining({ range: "'2026'!F3:N3" }),
            expect.objectContaining({ range: "'2026'!P3" }),
          ],
        }),
      }),
    );
  });

  it('resolves sheet tab dynamically by order year and throws if missing', async () => {
    googleApi.getSpreadsheet.mockResolvedValue({
      data: { sheets: [{ properties: { sheetId: 123, title: '2026' } }] },
    });

    const client = new GoogleSheetsClient({
      spreadsheetId: 'catalog-workbook',
      techniciansSpreadsheetId: 'technicians-workbook',
      clientsSheetName: 'Clientes',
      equipmentSheetName: 'SALIDAS',
      reportsSheetName: '2026',
      clientEmail: 'service-account@example.invalid',
      privateKey: 'private-key',
    });

    await expect(
      client.syncTechnicalReportRow({
        ...reportRow,
        fecha: '2027-01-15',
      }),
    ).rejects.toThrow("No se encontró la pestaña '2027' en el libro de técnicos");
  });

  it('auto-expands grid with appendDimension when targetRow exceeds rowCount', async () => {
    googleApi.getValues
      .mockResolvedValueOnce({
        data: {
          values: [
            ['sem', 'orden', 'tecnico', '', '', '', '', '', '', '', '', '', '', '', 'envio dhl', 'notas'],
            ['36', 'OS-001'],
          ],
        },
      })
      .mockResolvedValueOnce({ data: { values: [['37', 'OS-002']] } });

    googleApi.getSpreadsheet.mockResolvedValue({
      data: {
        sheets: [
          {
            properties: {
              sheetId: 456,
              title: '2026',
              gridProperties: { rowCount: 2 },
            },
          },
        ],
      },
    });
    googleApi.updateSpreadsheet.mockResolvedValue({});
    googleApi.updateValues.mockResolvedValue({});

    const client = new GoogleSheetsClient({
      spreadsheetId: 'catalog-workbook',
      techniciansSpreadsheetId: 'technicians-workbook',
      clientsSheetName: 'Clientes',
      equipmentSheetName: 'SALIDAS',
      reportsSheetName: '2026',
      clientEmail: 'service-account@example.invalid',
      privateKey: 'private-key',
    });

    await expect(client.syncTechnicalReportRow(reportRow)).resolves.toEqual({
      row: 3,
      created: true,
    });

    expect(googleApi.updateSpreadsheet).toHaveBeenCalledWith({
      spreadsheetId: 'technicians-workbook',
      requestBody: {
        requests: [
          {
            appendDimension: {
              sheetId: 456,
              dimension: 'ROWS',
              length: 1,
            },
          },
        ],
      },
    });
  });
});
