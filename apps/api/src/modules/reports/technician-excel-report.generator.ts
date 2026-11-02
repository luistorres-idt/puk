import ExcelJS from 'exceljs';
import { ORDER_SERVICE_LABELS, type OrderServiceType } from '@puk/contracts';
import {
  formatReportDate,
  getIsoWeek,
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
  readonly costo: number;
  readonly viaticos: number;
  readonly total: number;
  readonly notas: string;
}

function parseNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'object' && 'toFixed' in (value as object)) {
    return Number((value as { toFixed(d: number): string }).toFixed(2));
  }
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function resolveUnitRate(
  unit: NonNullable<ReportOrderSource['units']>[number],
  order: ReportOrderSource,
): number {
  const serviceType = unit.serviceType ?? order.serviceType;
  if (!serviceType) return 0;

  const overrides = order.pricingOverrides as
    { rates?: Partial<Record<OrderServiceType, string>> } | undefined;
  if (overrides?.rates?.[serviceType] !== undefined) {
    return parseNumber(overrides.rates[serviceType]);
  }

  const breakdownObj = order.pricingBreakdown as
    | {
        breakdown?: ReadonlyArray<{ serviceType: OrderServiceType; rate: string }>;
      }
    | undefined;
  if (breakdownObj?.breakdown) {
    const found = breakdownObj.breakdown.find((b) => b.serviceType === serviceType);
    if (found?.rate) return parseNumber(found.rate);
  }

  return parseNumber(order.pricingUnitRate);
}

export function buildTechnicianReportRows(
  orders: ReadonlyArray<ReportOrderSource>,
  timeZone = 'America/Hermosillo',
): TechnicianReportRow[] {
  const rows: TechnicianReportRow[] = [];

  for (const order of orders) {
    const sem = getIsoWeek(order.scheduledAt, timeZone);
    const fecha = formatReportDate(order.scheduledAt, timeZone);
    const cliente = order.clientNameSnapshot;
    const isFailedAppointment = order.status === 'FAILED_APPOINTMENT';

    let baseNotas = (order.generalNotes ?? '').trim();
    const failedReason = (order.failedReason ?? '').trim();
    if ((isFailedAppointment || order.failedReason) && failedReason) {
      const reasonText = `Motivo cita fallida: ${failedReason}`;
      baseNotas = baseNotas ? `${reasonText} | ${baseNotas}` : reasonText;
    }

    const orderTravelExpenses = parseNumber(order.pricingTravelExpenses);
    const units = [...(order.units ?? [])].sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (timeA !== timeB) return timeA - timeB;
      return a.id.localeCompare(b.id);
    });

    if (units.length === 0) {
      const servicio = isFailedAppointment
        ? ORDER_SERVICE_LABELS.FAILED_APPOINTMENT
        : order.serviceType
          ? (ORDER_SERVICE_LABELS[order.serviceType] ?? order.serviceType)
          : '';
      const costo = parseNumber(order.pricingBaseCost);
      const total = parseNumber(order.pricingTotal);

      rows.push({
        sem,
        folio: order.folio,
        fecha,
        cliente,
        economico: '',
        serie: '',
        imeiId: '',
        servicio,
        costo,
        viaticos: orderTravelExpenses,
        total,
        notas: baseNotas,
      });
      continue;
    }

    // When order has units, breakdown by unit
    for (let i = 0; i < units.length; i++) {
      const unit = units[i]!;
      const unitServiceType = unit.serviceType ?? order.serviceType;
      const servicio = isFailedAppointment
        ? ORDER_SERVICE_LABELS.FAILED_APPOINTMENT
        : unitServiceType
          ? (ORDER_SERVICE_LABELS[unitServiceType] ?? unitServiceType)
          : '';

      const imeiParts: string[] = [];
      if (unit.equipment && unit.equipment.length > 0) {
        for (const eq of unit.equipment) {
          const id = (eq.imei || eq.externalId || eq.externalKey || '').trim();
          if (id) imeiParts.push(id);
        }
      }
      const imeiId = imeiParts.join(', ');

      const costo = isFailedAppointment
        ? i === 0
          ? parseNumber(order.pricingBaseCost)
          : 0
        : resolveUnitRate(unit, order);

      // Attribute travel expenses only to the first unit to prevent duplication in sums
      const viaticos = i === 0 ? orderTravelExpenses : 0;
      const total = Number((costo + viaticos).toFixed(2));

      rows.push({
        sem,
        folio: order.folio,
        fecha,
        cliente,
        economico: unit.label.trim(),
        serie: unit.serialNumber.trim(),
        imeiId,
        servicio,
        costo,
        viaticos,
        total,
        notas: i === 0 ? baseNotas : '',
      });
    }
  }

  return rows;
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
    { header: 'Costo', key: 'costo', width: 14, style: { numFmt: '$#,##0.00' } },
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
    added.alignment = { vertical: 'middle' };
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
