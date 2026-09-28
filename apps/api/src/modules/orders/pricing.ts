import type { OrderPricingOverrides, PricingBreakdown } from '@puk/contracts';
import { Prisma } from '../../generated/prisma/client.js';
import type { OrderServiceType } from '../../generated/prisma/client.js';

export interface TechnicianPricingSource {
  readonly id: string;
  readonly name: string;
  readonly externalKey?: string | null;
  readonly departureCost?: Prisma.Decimal | string | number | null;
  readonly replacementRate?: Prisma.Decimal | string | number | null;
  readonly installationRate?: Prisma.Decimal | string | number | null;
  readonly reviewRate?: Prisma.Decimal | string | number | null;
  readonly uninstallationRate?: Prisma.Decimal | string | number | null;
  readonly failedAppointmentRate?: Prisma.Decimal | string | number | null;
  readonly fuelSensorRate?: Prisma.Decimal | string | number | null;
}

export interface ServiceRateResolution {
  readonly rate: Prisma.Decimal | null;
  readonly isConfigured: boolean;
  readonly rateLabel: string;
}

export interface ServiceBreakdownResult {
  readonly serviceType: OrderServiceType;
  readonly rate: Prisma.Decimal;
  readonly quantity: number;
  readonly subtotal: Prisma.Decimal;
}

export interface CalculatedOrderPricing {
  readonly technicianId: string;
  readonly technicianNameSnapshot: string;
  readonly technicianExternalKeySnapshot: string | null;
  readonly serviceType: OrderServiceType;
  readonly unitRate: Prisma.Decimal | null;
  readonly appliedQuantity: number;
  readonly baseCost: Prisma.Decimal;
  readonly departureCost: Prisma.Decimal;
  readonly travelExpenses: Prisma.Decimal;
  readonly total: Prisma.Decimal;
  readonly currency: 'MXN';
  readonly snapshotAt: Date;
  readonly pricingVersion: number;
  readonly breakdown: readonly ServiceBreakdownResult[];
  readonly warnings?: readonly string[];
}

export interface CalculateOrderPricingInput {
  readonly technician: TechnicianPricingSource;
  readonly serviceType?: OrderServiceType | null;
  readonly equipmentCount?: number;
  readonly isHomeService: boolean;
  readonly pricingVersion?: number;
  readonly snapshotAt?: Date;
  readonly items?: ReadonlyArray<{
    serviceType: OrderServiceType;
    equipmentCount?: number;
  }>;
  readonly overrides?: OrderPricingOverrides | null;
}

export function createPricingBreakdownSnapshot(pricing: CalculatedOrderPricing): PricingBreakdown {
  return {
    breakdown: pricing.breakdown.map((item) => ({
      serviceType: item.serviceType,
      rate: item.rate.toFixed(2),
      quantity: item.quantity,
      subtotal: item.subtotal.toFixed(2),
    })),
    departureCost: pricing.departureCost.toFixed(2),
    travelExpenses: pricing.travelExpenses.toFixed(2),
    warnings: [...(pricing.warnings ?? [])],
  };
}

function toDecimalOrNull(
  val: Prisma.Decimal | string | number | null | undefined,
): Prisma.Decimal | null {
  if (val === null || val === undefined || val === '') return null;
  try {
    const d = new Prisma.Decimal(val);
    if (d.isNaN() || d.isNegative()) return null;
    return d;
  } catch {
    return null;
  }
}

function roundToTwoDecimals(d: Prisma.Decimal): Prisma.Decimal {
  // Prisma.Decimal (Decimal.js) toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
  return d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function resolveServiceRate(
  technician: TechnicianPricingSource,
  serviceType: OrderServiceType,
  overrideRate?: Prisma.Decimal | string | number | null,
): ServiceRateResolution {
  let rawRate: Prisma.Decimal | string | number | null | undefined;
  let rateLabel: string;

  switch (serviceType) {
    case 'INSTALLATION':
      rawRate = overrideRate !== undefined ? overrideRate : technician.installationRate;
      rateLabel = 'INSTALACION';
      break;
    case 'REVIEW':
      rawRate = overrideRate !== undefined ? overrideRate : technician.reviewRate;
      rateLabel = 'REVISION';
      break;
    case 'UNINSTALLATION':
      rawRate = overrideRate !== undefined ? overrideRate : technician.uninstallationRate;
      rateLabel = 'DESINSTALACION';
      break;
    case 'FAILED_APPOINTMENT':
      rawRate = overrideRate !== undefined ? overrideRate : technician.failedAppointmentRate;
      rateLabel = 'CITA FALLIDA';
      break;
    case 'FUEL_SENSOR':
      rawRate = overrideRate !== undefined ? overrideRate : technician.fuelSensorRate;
      rateLabel = 'SENSOR FUEL';
      break;
    case 'EQUIPMENT_REPLACEMENT':
      rawRate = overrideRate !== undefined ? overrideRate : technician.replacementRate;
      rateLabel = 'CAMBIO DE EQUIPO';
      break;
  }

  const rate = toDecimalOrNull(rawRate);
  const isConfigured = rate !== null;

  return {
    rate: rate !== null ? roundToTwoDecimals(rate) : null,
    isConfigured,
    rateLabel,
  };
}

export function calculateOrderPricing(input: CalculateOrderPricingInput): CalculatedOrderPricing {
  const { technician, isHomeService, overrides } = input;

  const rawOverrideDeparture =
    overrides?.departureCost !== undefined && overrides.departureCost !== null
      ? toDecimalOrNull(overrides.departureCost)
      : null;
  const rawDeparture = rawOverrideDeparture ?? toDecimalOrNull(technician.departureCost);
  const departureCost = rawDeparture
    ? roundToTwoDecimals(rawDeparture)
    : new Prisma.Decimal('0.00');

  let travelExpenses: Prisma.Decimal;
  if (overrides?.travelExpenses !== undefined && overrides.travelExpenses !== null) {
    const rawTravel = toDecimalOrNull(overrides.travelExpenses);
    travelExpenses = rawTravel ? roundToTwoDecimals(rawTravel) : new Prisma.Decimal('0.00');
  } else {
    travelExpenses = isHomeService ? departureCost : new Prisma.Decimal('0.00');
  }

  const pricingVersion = input.pricingVersion ?? 1;
  const snapshotAt = input.snapshotAt ?? new Date();

  // Special case: FAILED_APPOINTMENT
  if (input.serviceType === 'FAILED_APPOINTMENT') {
    const override = overrides?.rates?.FAILED_APPOINTMENT;
    const resolution = resolveServiceRate(technician, 'FAILED_APPOINTMENT', override);
    const appliedQuantity = Math.max(1, input.equipmentCount ?? 0);
    if (!resolution.isConfigured || resolution.rate === null) {
      // Missing or invalid fee in CITA FALLIDA => 0.00
      return {
        technicianId: technician.id,
        technicianNameSnapshot: technician.name,
        technicianExternalKeySnapshot: technician.externalKey ?? null,
        serviceType: 'FAILED_APPOINTMENT',
        unitRate: null,
        appliedQuantity,
        baseCost: new Prisma.Decimal('0.00'),
        departureCost,
        travelExpenses: new Prisma.Decimal('0.00'),
        total: new Prisma.Decimal('0.00'),
        currency: 'MXN',
        snapshotAt,
        pricingVersion,
        breakdown: [],
        warnings: [
          `El técnico ${technician.name} no tiene configurada tarifa para CITA FALLIDA. Se aplicó $0.00.`,
        ],
      };
    }

    const baseCost = roundToTwoDecimals(resolution.rate.times(appliedQuantity));
    const total = roundToTwoDecimals(baseCost.plus(travelExpenses));

    return {
      technicianId: technician.id,
      technicianNameSnapshot: technician.name,
      technicianExternalKeySnapshot: technician.externalKey ?? null,
      serviceType: 'FAILED_APPOINTMENT',
      unitRate: resolution.rate,
      appliedQuantity,
      baseCost,
      departureCost,
      travelExpenses,
      total,
      currency: 'MXN',
      snapshotAt,
      pricingVersion,
      breakdown: [
        {
          serviceType: 'FAILED_APPOINTMENT',
          rate: resolution.rate,
          quantity: appliedQuantity,
          subtotal: baseCost,
        },
      ],
      warnings: [],
    };
  }

  if (input.items && input.items.length > 0) {
    const grouped = new Map<OrderServiceType, number>();
    for (const item of input.items) {
      const count =
        item.serviceType === 'EQUIPMENT_REPLACEMENT' ? 1 : Math.max(0, item.equipmentCount ?? 0);
      grouped.set(item.serviceType, (grouped.get(item.serviceType) ?? 0) + count);
    }

    const breakdown: ServiceBreakdownResult[] = [];
    const warnings: string[] = [];
    let baseCost = new Prisma.Decimal('0.00');

    for (const [sType, count] of grouped.entries()) {
      const override = overrides?.rates?.[sType];
      const resolution = resolveServiceRate(technician, sType, override);
      let effectiveRate: Prisma.Decimal;
      if (!resolution.isConfigured || resolution.rate === null) {
        effectiveRate = new Prisma.Decimal('0.00');
        warnings.push(
          `El técnico ${technician.name} no tiene configurada una tarifa válida para el servicio ${resolution.rateLabel}. Se aplicó tarifa de $0.00 MXN.`,
        );
      } else {
        effectiveRate = resolution.rate;
      }

      const subtotal = roundToTwoDecimals(effectiveRate.times(count));
      baseCost = roundToTwoDecimals(baseCost.plus(subtotal));

      breakdown.push({
        serviceType: sType,
        rate: effectiveRate,
        quantity: count,
        subtotal,
      });
    }

    const total = roundToTwoDecimals(baseCost.plus(travelExpenses));
    const totalAppliedQuantity = breakdown.reduce((sum, b) => sum + b.quantity, 0);
    const distinctTypes = Array.from(grouped.keys());

    return {
      technicianId: technician.id,
      technicianNameSnapshot: technician.name,
      technicianExternalKeySnapshot: technician.externalKey ?? null,
      serviceType:
        distinctTypes.length === 1 ? distinctTypes[0]! : (input.serviceType ?? distinctTypes[0]!),
      unitRate: distinctTypes.length === 1 ? breakdown[0]!.rate : null,
      appliedQuantity: totalAppliedQuantity,
      baseCost,
      departureCost,
      travelExpenses,
      total,
      currency: 'MXN',
      snapshotAt,
      pricingVersion,
      breakdown,
      warnings,
    };
  }

  // Single-service fallback
  const serviceType = input.serviceType ?? 'INSTALLATION';
  const equipmentCount = input.equipmentCount ?? 0;
  const override = overrides?.rates?.[serviceType];
  const resolution = resolveServiceRate(technician, serviceType, override);
  const warnings: string[] = [];
  let effectiveRate: Prisma.Decimal;

  if (!resolution.isConfigured || resolution.rate === null) {
    effectiveRate = new Prisma.Decimal('0.00');
    warnings.push(
      `El técnico ${technician.name} no tiene configurada una tarifa válida para el servicio ${resolution.rateLabel}. Se aplicó tarifa de $0.00 MXN.`,
    );
  } else {
    effectiveRate = resolution.rate;
  }

  let appliedQuantity: number;
  if (serviceType === 'EQUIPMENT_REPLACEMENT') {
    appliedQuantity = 1;
  } else {
    appliedQuantity = equipmentCount;
  }

  const baseCost = roundToTwoDecimals(effectiveRate.times(appliedQuantity));
  const total = roundToTwoDecimals(baseCost.plus(travelExpenses));

  return {
    technicianId: technician.id,
    technicianNameSnapshot: technician.name,
    technicianExternalKeySnapshot: technician.externalKey ?? null,
    serviceType,
    unitRate: effectiveRate,
    appliedQuantity,
    baseCost,
    departureCost,
    travelExpenses,
    total,
    currency: 'MXN',
    snapshotAt,
    pricingVersion,
    breakdown: [
      {
        serviceType,
        rate: effectiveRate,
        quantity: appliedQuantity,
        subtotal: baseCost,
      },
    ],
    warnings,
  };
}
