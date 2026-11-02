import ExcelJS from 'exceljs';
import {
  formatTechnicalReportRow,
  type ReportOrderSource,
} from './technical-report-formatter.js';

export interface TechnicianSummary {
  readonly id?: string;
  readonly name: string;
  readonly externalKey?: string | null;
}

export interface TechnicianReportRow {
  readonly sem: number;
  readonly folio: string;
  readonly fecha: string;
  readonly cliente: string;
  readonly economico: string;
  readonly serie: string;
  readonly imeiId: string;
  readonly servicio: string;
  readonly costo: string | number;
  readonly viaticos: number;
  readonly total: number;
  readonly notas: string;
}

export function buildTechnicianReportRows(
  orders: ReadonlyArray<ReportOrderSource>,
  timeZone = 'America/Hermosillo',
): TechnicianReportRow[] {
  return orders.map((order) => {
    const formatted = formatTechnicalReportRow(order, timeZone);
    const hasMultilineCost = formatted.costo.includes('\n');
    const costo = hasMultilineCost ? formatted.costo : Number(formatted.costo);
    const viaticos = Number(formatted.viaticos);
    const total = Number(formatted.total);

    return {
      sem: Number(formatted.sem),
      folio: formatted.folio,
      fecha: formatted.fecha,
      cliente: formatted.cliente,
      economico: formatted.economico,
      serie: formatted.serie,
      imeiId: formatted.imeiId,
      servicio: formatted.servicio,
      costo,
      viaticos,
      total,
      notas: formatted.notas,
    };
  });
}

export async function generateTechnicianExcelReport(
  technician: TechnicianSummary,
  orders: ReadonlyArray<ReportOrderSource>,
  timeZone = 'America/Hermosillo',
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PUK Technical Platform';
  workbook.created = new Date();

  const sheetName = (technician.name || 'Técnico').slice(0, 31).replace(/[\\/?*[\]]/g, '-');
  const worksheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  worksheet.columns = [
    { header: 'Semana', key: 'sem', width: 10 },
    { header: 'Folio', key: 'folio', width: 14 },
    { header: 'Fecha', key: 'fecha', width: 14 },
    { header: 'Cliente', key: 'cliente', width: 30 },
    { header: 'Económico', key: 'economico', width: 18 },
    { header: 'Serie', key: 'serie', width: 20 },
    { header: 'IMEI / ID', key: 'imeiId', width: 22 },
    { header: 'Servicio', key: 'servicio', width: 25 },
    { header: 'Costo', key: 'costo', width: 16, style: { numFmt: '$#,##0.00' } },
    { header: 'Viáticos', key: 'viaticos', width: 14, style: { numFmt: '$#,##0.00' } },
    { header: 'Total', key: 'total', width: 14, style: { numFmt: '$#,##0.00' } },
    { header: 'Notas', key: 'notas', width: 35 },
  ];

  // Header styling
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' }, // Slate-800
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 24;

  const rows = buildTechnicianReportRows(orders, timeZone);
  for (const row of rows) {
    const added = worksheet.addRow(row);
    added.alignment = { vertical: 'top', wrapText: true };
  }

  // Format header row cells borders
  for (let c = 1; c <= 12; c++) {
    const cell = headerRow.getCell(c);
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
