import ExcelJS from 'exceljs';
import { formatTechnicalReportRow, type ReportOrderSource } from './technical-report-formatter.js';

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
  readonly envioDhl?: number;
  readonly total: number;
  readonly notas: string;
}

export interface ConsolidatedReportRow extends TechnicianReportRow {
  readonly tecnico: string;
}

export interface ExcelReportOptions {
  readonly includeDhl?: boolean;
}

function parseOptionalAmount(
  value?: { toFixed(digits: number): string } | number | string | null,
): number {
  if (value === null || value === undefined || value === '') return 0;
  const numeric = typeof value === 'object' ? Number(value.toFixed(2)) : Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : 0;
}

function formatExcelRowBase(
  order: ReportOrderSource,
  timeZone: string,
  includeDhl = false,
): { formatted: ReturnType<typeof formatTechnicalReportRow>; row: TechnicianReportRow } {
  const formatted = formatTechnicalReportRow(order, timeZone);
  const hasMultilineCost = formatted.costo.includes('\n');
  const costo = hasMultilineCost ? formatted.costo : Number(formatted.costo);
  const viaticos = Number(formatted.viaticos);
  const envioDhl = parseOptionalAmount(order.dhlShippingCost);
  const baseTotal = Number(formatted.total);
  const total = includeDhl ? Math.round((baseTotal + envioDhl) * 100) / 100 : baseTotal;

  return {
    formatted,
    row: {
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
      ...(includeDhl ? { envioDhl } : {}),
      total,
      notas: formatted.notas,
    },
  };
}

export function buildTechnicianReportRows(
  orders: ReadonlyArray<ReportOrderSource>,
  timeZone = 'America/Hermosillo',
  options: ExcelReportOptions = {},
): TechnicianReportRow[] {
  return orders.map((order) => formatExcelRowBase(order, timeZone, options.includeDhl).row);
}

export function buildConsolidatedReportRows(
  orders: ReadonlyArray<ReportOrderSource>,
  timeZone = 'America/Hermosillo',
  options: ExcelReportOptions = {},
): ConsolidatedReportRow[] {
  return orders.map((order) => {
    const { formatted, row } = formatExcelRowBase(order, timeZone, options.includeDhl);
    return {
      ...row,
      tecnico: formatted.tecnico || 'Técnico',
    };
  });
}

const BASE_HEAD_COLUMNS: Partial<ExcelJS.Column>[] = [
  { header: 'Semana', key: 'sem', width: 10 },
  { header: 'Folio', key: 'folio', width: 14 },
  { header: 'Fecha', key: 'fecha', width: 14 },
];

function buildTailColumns(includeDhl = false): Partial<ExcelJS.Column>[] {
  return [
    { header: 'Cliente', key: 'cliente', width: 30 },
    { header: 'Económico', key: 'economico', width: 18 },
    { header: 'Serie', key: 'serie', width: 20 },
    { header: 'IMEI / ID', key: 'imeiId', width: 22 },
    { header: 'Servicio', key: 'servicio', width: 25 },
    { header: 'Costo', key: 'costo', width: 16, style: { numFmt: '#,##0.00' } },
    { header: 'Viáticos', key: 'viaticos', width: 14, style: { numFmt: '#,##0.00' } },
    ...(includeDhl
      ? [{ header: 'Envío DHL', key: 'envioDhl', width: 14, style: { numFmt: '#,##0.00' } }]
      : []),
    { header: 'Total', key: 'total', width: 14, style: { numFmt: '$#,##0.00' } },
    { header: 'Notas', key: 'notas', width: 35 },
  ];
}

async function renderExcelReportWorkbook(
  sheetName: string,
  columns: Partial<ExcelJS.Column>[],
  rows: ReadonlyArray<object>,
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PUK Technical Platform';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  worksheet.columns = columns;

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' }, // Slate-800
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 24;

  for (const row of rows) {
    const added = worksheet.addRow(row);
    added.alignment = { vertical: 'top', wrapText: true };
  }

  for (let c = 1; c <= columns.length; c++) {
    const cell = headerRow.getCell(c);
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

export async function generateTechnicianExcelReport(
  technician: TechnicianSummary,
  orders: ReadonlyArray<ReportOrderSource>,
  timeZone = 'America/Hermosillo',
  options: ExcelReportOptions = {},
): Promise<Uint8Array> {
  const rawSheetName = (technician.name || 'Técnico')
    .slice(0, 31)
    .replace(/[\\/?*:[\]]/g, '-')
    .trim();
  const sheetName = rawSheetName.length > 0 ? rawSheetName : 'Técnico';

  return renderExcelReportWorkbook(
    sheetName,
    [...BASE_HEAD_COLUMNS, ...buildTailColumns(options.includeDhl)],
    buildTechnicianReportRows(orders, timeZone, options),
  );
}

export async function generateConsolidatedExcelReport(
  orders: ReadonlyArray<ReportOrderSource>,
  timeZone = 'America/Hermosillo',
  options: ExcelReportOptions = {},
): Promise<Uint8Array> {
  return renderExcelReportWorkbook(
    'Servicios Consolidados',
    [
      ...BASE_HEAD_COLUMNS,
      { header: 'Técnico', key: 'tecnico', width: 25 },
      ...buildTailColumns(options.includeDhl),
    ],
    buildConsolidatedReportRows(orders, timeZone, options),
  );
}
