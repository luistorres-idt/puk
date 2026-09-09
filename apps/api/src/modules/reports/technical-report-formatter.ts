import { ORDER_SERVICE_LABELS, type OrderServiceType } from '@puk/contracts';

export interface ReportOrderSource {
  readonly folio: string;
  readonly serviceType: OrderServiceType;
  readonly clientNameSnapshot: string;
  readonly scheduledAt: Date | string;
  readonly generalNotes?: string | null;
  readonly failedReason?: string | null;
  readonly technicianNameSnapshot?: string | null;
  readonly pricingBaseCost?: { toFixed(digits: number): string } | number | string | null;
  readonly pricingTravelExpenses?: { toFixed(digits: number): string } | number | string | null;
  readonly pricingTotal?: { toFixed(digits: number): string } | number | string | null;
  readonly units?: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
    readonly serialNumber: string;
    readonly createdAt?: Date | string;
    readonly equipment?: ReadonlyArray<{
      readonly imei?: string | null;
      readonly externalId?: string | null;
      readonly externalKey?: string | null;
    }>;
  }>;
}

export interface TechnicalReportRowData {
  readonly folio: string;
  readonly sem: string;
  readonly tecnico: string;
  readonly economico: string;
  readonly serie: string;
  readonly imeiId: string;
  readonly cliente: string;
  readonly fecha: string;
  readonly servicio: string;
  readonly costo: string;
  readonly viaticos: string;
  readonly total: string;
  readonly notas: string;
}

export function getIsoWeek(dateInput: Date | string, timeZone = 'America/Hermosillo'): number {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((p) => p.type === 'year')!.value);
  const month = Number(parts.find((p) => p.type === 'month')!.value) - 1;
  const day = Number(parts.find((p) => p.type === 'day')!.value);

  const target = new Date(Date.UTC(year, month, day));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.getTime();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
  }
  return 1 + Math.ceil((firstThursday - target.getTime()) / 604800000);
}

export function formatReportDate(dateInput: Date | string, timeZone = 'America/Hermosillo'): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

function formatDecimalString(val?: { toFixed(digits: number): string } | number | string | null): string {
  if (val === null || val === undefined || val === '') return '0.00';
  if (typeof val === 'object' && typeof val.toFixed === 'function') {
    return val.toFixed(2);
  }
  const num = Number(val);
  if (!Number.isFinite(num)) return '0.00';
  return num.toFixed(2);
}

export function formatTechnicalReportRow(
  order: ReportOrderSource,
  timeZone = 'America/Hermosillo',
): TechnicalReportRowData {
  const sem = String(getIsoWeek(order.scheduledAt, timeZone));
  const fecha = formatReportDate(order.scheduledAt, timeZone);
  const tecnico = (order.technicianNameSnapshot ?? '').trim();
  const cliente = (order.clientNameSnapshot ?? '').trim();
  const servicio = ORDER_SERVICE_LABELS[order.serviceType] ?? order.serviceType;

  const sortedUnits = [...(order.units ?? [])].sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (timeA !== timeB) return timeA - timeB;
    return a.id.localeCompare(b.id);
  });

  const economico = sortedUnits.map((u) => u.label.trim()).join('\n');
  const serie = sortedUnits.map((u) => u.serialNumber.trim()).join('\n');

  const imeiIdParts: string[] = [];
  for (const unit of sortedUnits) {
    if (unit.equipment && unit.equipment.length > 0) {
      for (const eq of unit.equipment) {
        const identifier = (eq.imei || eq.externalId || eq.externalKey || '').trim();
        if (identifier) imeiIdParts.push(identifier);
      }
    }
  }
  const imeiId = imeiIdParts.join('\n');

  const costo = formatDecimalString(order.pricingBaseCost);
  const viaticos = formatDecimalString(order.pricingTravelExpenses);
  const total = formatDecimalString(order.pricingTotal);

  let notas = (order.generalNotes ?? '').trim();
  if (order.serviceType === 'FAILED_APPOINTMENT' && order.failedReason) {
    const reasonText = `Motivo cita fallida: ${order.failedReason.trim()}`;
    notas = notas ? `${reasonText} | ${notas}` : reasonText;
  }

  return {
    folio: order.folio,
    sem,
    tecnico,
    economico,
    serie,
    imeiId,
    cliente,
    fecha,
    servicio,
    costo,
    viaticos,
    total,
    notas,
  };
}
