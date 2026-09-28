import {
  ORDER_SERVICE_LABELS,
  type OrderPricingOverrides,
  type OrderServiceType,
  type OrderStatus,
  type PricingBreakdown,
} from '@puk/contracts';

export interface ReportOrderSource {
  readonly folio: string;
  readonly serviceType?: OrderServiceType | null;
  readonly status?: OrderStatus | null;
  readonly clientNameSnapshot: string;
  readonly scheduledAt: Date | string;
  readonly generalNotes?: string | null;
  readonly failedReason?: string | null;
  readonly technicianNameSnapshot?: string | null;
  readonly pricingUnitRate?: { toFixed(digits: number): string } | number | string | null;
  readonly pricingBaseCost?: { toFixed(digits: number): string } | number | string | null;
  readonly pricingTravelExpenses?: { toFixed(digits: number): string } | number | string | null;
  readonly pricingTotal?: { toFixed(digits: number): string } | number | string | null;
  readonly pricingBreakdown?:
    | PricingBreakdown
    | {
        breakdown?: ReadonlyArray<{
          serviceType: OrderServiceType;
          rate: string;
          quantity?: number;
          subtotal?: string;
        }>;
      }
    | unknown;
  readonly pricingOverrides?: OrderPricingOverrides | unknown;
  readonly units?: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
    readonly serialNumber: string;
    readonly serviceType?: OrderServiceType | null;
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

export function formatReportDate(
  dateInput: Date | string,
  timeZone = 'America/Hermosillo',
): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

function formatDecimalString(
  val?: { toFixed(digits: number): string } | number | string | null,
): string {
  if (val === null || val === undefined || val === '') return '0.00';
  if (typeof val === 'object' && typeof val.toFixed === 'function') {
    return val.toFixed(2);
  }
  const num = Number(val);
  if (!Number.isFinite(num)) return '0.00';
  return num.toFixed(2);
}

function resolveUnitCost(
  unit: NonNullable<ReportOrderSource['units']>[number],
  order: ReportOrderSource,
  totalUnitsCount: number,
): string {
  const serviceType = unit.serviceType ?? order.serviceType;
  const eqCount =
    serviceType === 'EQUIPMENT_REPLACEMENT'
      ? 1
      : unit.equipment && unit.equipment.length > 0
        ? unit.equipment.length
        : 1;

  // 1. Try to extract from pricingBreakdown snapshot
  let breakdownItems:
    | Array<{ serviceType: string; rate: string; quantity?: number; subtotal?: string }>
    | undefined;

  if (order.pricingBreakdown) {
    if (typeof order.pricingBreakdown === 'string') {
      try {
        const parsed = JSON.parse(order.pricingBreakdown);
        breakdownItems = parsed?.breakdown;
      } catch {
        // ignore JSON parse error
      }
    } else if (typeof order.pricingBreakdown === 'object') {
      breakdownItems = (
        order.pricingBreakdown as {
          breakdown?: Array<{
            serviceType: string;
            rate: string;
            quantity?: number;
            subtotal?: string;
          }>;
        }
      ).breakdown;
    }
  }

  if (breakdownItems && Array.isArray(breakdownItems) && serviceType) {
    const item = breakdownItems.find((b) => b.serviceType === serviceType);
    if (item && item.rate !== undefined && item.rate !== null) {
      const rateNum = Number(item.rate);
      if (Number.isFinite(rateNum)) {
        return (rateNum * eqCount).toFixed(2);
      }
    }
  }

  // 2. Try to extract from pricingOverrides rates
  const overrides = order.pricingOverrides as OrderPricingOverrides | undefined;
  if (serviceType && overrides?.rates?.[serviceType]) {
    const overrideRate = Number(overrides.rates[serviceType]);
    if (Number.isFinite(overrideRate)) {
      return (overrideRate * eqCount).toFixed(2);
    }
  }

  // 3. Try pricingUnitRate
  if (order.pricingUnitRate !== undefined && order.pricingUnitRate !== null) {
    const unitRateNum = Number(formatDecimalString(order.pricingUnitRate));
    if (Number.isFinite(unitRateNum) && unitRateNum > 0) {
      return (unitRateNum * eqCount).toFixed(2);
    }
  }

  // 4. Fallback if pricingBaseCost exists
  if (order.pricingBaseCost !== undefined && order.pricingBaseCost !== null) {
    const baseCostNum = Number(formatDecimalString(order.pricingBaseCost));
    if (Number.isFinite(baseCostNum) && totalUnitsCount > 0) {
      return (baseCostNum / totalUnitsCount).toFixed(2);
    }
  }

  return '0.00';
}

export function formatTechnicalReportRow(
  order: ReportOrderSource,
  timeZone = 'America/Hermosillo',
): TechnicalReportRowData {
  const sem = String(getIsoWeek(order.scheduledAt, timeZone));
  const fecha = formatReportDate(order.scheduledAt, timeZone);
  const tecnico = (order.technicianNameSnapshot ?? '').trim();
  const cliente = (order.clientNameSnapshot ?? '').trim();

  const sortedUnits = [...(order.units ?? [])].sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (timeA !== timeB) return timeA - timeB;
    return a.id.localeCompare(b.id);
  });

  const isFailedAppointment = order.status === 'FAILED_APPOINTMENT';

  let servicio: string;
  if (isFailedAppointment) {
    servicio = ORDER_SERVICE_LABELS.FAILED_APPOINTMENT;
  } else if (sortedUnits.length > 0 && sortedUnits.some((u) => u.serviceType)) {
    servicio = sortedUnits
      .map((u) => {
        const type = u.serviceType ?? order.serviceType;
        return type ? (ORDER_SERVICE_LABELS[type] ?? type) : '';
      })
      .join('\n');
  } else if (order.serviceType) {
    servicio = ORDER_SERVICE_LABELS[order.serviceType] ?? order.serviceType;
  } else {
    servicio = '';
  }

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

  let costo: string;
  if (!isFailedAppointment && servicio.includes('\n') && sortedUnits.length > 1) {
    costo = sortedUnits.map((u) => resolveUnitCost(u, order, sortedUnits.length)).join('\n');
  } else {
    costo = formatDecimalString(order.pricingBaseCost);
  }
  const viaticos = formatDecimalString(order.pricingTravelExpenses);
  const total = formatDecimalString(order.pricingTotal);

  let notas = (order.generalNotes ?? '').trim();
  const failedReason = (order.failedReason ?? '').trim();
  if ((isFailedAppointment || order.failedReason) && failedReason) {
    const reasonText = `Motivo cita fallida: ${failedReason}`;
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
