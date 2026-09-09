import { Prisma } from '../../generated/prisma/client.js';
import type { OrderServiceType } from '../../generated/prisma/client.js';
import { AppError } from '../../shared/errors.js';

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
}

export interface CalculateOrderPricingInput {
  readonly technician: TechnicianPricingSource;
  readonly serviceType: OrderServiceType;
  readonly equipmentCount: number;
  readonly isHomeService: boolean;
  readonly pricingVersion?: number;
  readonly snapshotAt?: Date;
}

function toDecimalOrNull(val: Prisma.Decimal | string | number | null | undefined): Prisma.Decimal | null {
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
): ServiceRateResolution {
  let rawRate: Prisma.Decimal | string | number | null | undefined;
  let rateLabel: string;

  switch (serviceType) {
    case 'INSTALLATION':
      rawRate = technician.installationRate;
      rateLabel = 'INSTALACION';
      break;
    case 'REVIEW':
      rawRate = technician.reviewRate;
      rateLabel = 'REVISION';
      break;
    case 'UNINSTALLATION':
      rawRate = technician.uninstallationRate;
      rateLabel = 'DESINSTALACION';
      break;
    case 'FAILED_APPOINTMENT':
      rawRate = technician.failedAppointmentRate;
      rateLabel = 'CITA FALLIDA';
      break;
    case 'FUEL_SENSOR':
      rawRate = technician.fuelSensorRate;
      rateLabel = 'SENSOR FUEL';
      break;
    case 'EQUIPMENT_REPLACEMENT':
      rawRate = technician.replacementRate;
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
  const { technician, serviceType, equipmentCount, isHomeService } = input;
  const resolution = resolveServiceRate(technician, serviceType);

  const rawDeparture = toDecimalOrNull(technician.departureCost);
  const departureCost = rawDeparture ? roundToTwoDecimals(rawDeparture) : new Prisma.Decimal('0.00');
  const travelExpenses = isHomeService ? departureCost : new Prisma.Decimal('0.00');

  const pricingVersion = input.pricingVersion ?? 1;
  const snapshotAt = input.snapshotAt ?? new Date();

  // Special case: FAILED_APPOINTMENT
  if (serviceType === 'FAILED_APPOINTMENT') {
    const appliedQuantity = Math.max(1, equipmentCount);
    if (!resolution.isConfigured || resolution.rate === null) {
      // Missing or invalid fee in CITA FALLIDA => 0.00
      return {
        technicianId: technician.id,
        technicianNameSnapshot: technician.name,
        technicianExternalKeySnapshot: technician.externalKey ?? null,
        serviceType,
        unitRate: null,
        appliedQuantity,
        baseCost: new Prisma.Decimal('0.00'),
        departureCost,
        travelExpenses: new Prisma.Decimal('0.00'),
        total: new Prisma.Decimal('0.00'),
        currency: 'MXN',
        snapshotAt,
        pricingVersion,
      };
    }

    const baseCost = roundToTwoDecimals(resolution.rate.times(appliedQuantity));
    const total = roundToTwoDecimals(baseCost.plus(travelExpenses));

    return {
      technicianId: technician.id,
      technicianNameSnapshot: technician.name,
      technicianExternalKeySnapshot: technician.externalKey ?? null,
      serviceType,
      unitRate: resolution.rate,
      appliedQuantity,
      baseCost,
      departureCost,
      travelExpenses,
      total,
      currency: 'MXN',
      snapshotAt,
      pricingVersion,
    };
  }

  // All other services require a valid configured rate!
  if (!resolution.isConfigured || resolution.rate === null) {
    throw new AppError(
      400,
      'MISSING_SERVICE_RATE',
      `El técnico ${technician.name} no tiene configurada una tarifa válida para el servicio ${resolution.rateLabel}.`,
      {
        technicianId: technician.id,
        technicianName: technician.name,
        serviceType,
        rateLabel: resolution.rateLabel,
      },
    );
  }

  // Equipment count rules:
  // In EQUIPMENT_REPLACEMENT, charge exactly 1 unit for the complete service
  let appliedQuantity: number;
  if (serviceType === 'EQUIPMENT_REPLACEMENT') {
    appliedQuantity = 1;
  } else {
    appliedQuantity = equipmentCount;
  }

  const baseCost = roundToTwoDecimals(resolution.rate.times(appliedQuantity));
  const total = roundToTwoDecimals(baseCost.plus(travelExpenses));

  return {
    technicianId: technician.id,
    technicianNameSnapshot: technician.name,
    technicianExternalKeySnapshot: technician.externalKey ?? null,
    serviceType,
    unitRate: resolution.rate,
    appliedQuantity,
    baseCost,
    departureCost,
    travelExpenses,
    total,
    currency: 'MXN',
    snapshotAt,
    pricingVersion,
  };
}
