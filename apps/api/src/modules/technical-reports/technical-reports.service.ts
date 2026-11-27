import {
  ORDER_SERVICE_LABELS,
  type TechnicalReportExportQuery,
  type TechnicalReportOrder,
  type TechnicalReportQuery,
  type TechnicalReportResponse,
  type TechnicalReportTechnicianGroup,
  type UpdateOrderDhlShipping,
} from '@puk/contracts';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../shared/errors.js';
import {
  calculateCurrentCutoffWindow,
  type TechnicalReportSyncScheduleService,
} from '../orders/index.js';
import {
  generateConsolidatedExcelReport,
  generateTechnicianExcelReport,
  getIsoWeek,
} from '../reports/index.js';

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const REPORTABLE_STATUSES = ['COMPLETED', 'FAILED_APPOINTMENT'] as const;

const technicalReportOrderSelection = {
  id: true,
  folio: true,
  status: true,
  serviceType: true,
  clientNameSnapshot: true,
  technicianId: true,
  technicianNameSnapshot: true,
  pricingUnitRate: true,
  pricingBaseCost: true,
  pricingTravelExpenses: true,
  pricingTotal: true,
  dhlShippingCost: true,
  pricingCurrency: true,
  pricingBreakdown: true,
  pricingOverrides: true,
  scheduledAt: true,
  completedAt: true,
  generalNotes: true,
  failedReason: true,
  technician: {
    select: {
      id: true,
      name: true,
      legalName: true,
      taxData: true,
      externalKey: true,
    },
  },
  units: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    select: {
      id: true,
      label: true,
      serialNumber: true,
      serviceType: true,
      createdAt: true,
      equipment: {
        select: {
          imei: true,
          externalId: true,
          externalKey: true,
        },
      },
    },
  },
} satisfies Prisma.OrderSelect;

type SelectedReportOrder = Prisma.OrderGetPayload<{ select: typeof technicalReportOrderSelection }>;

export interface TechnicalReportExportResult {
  readonly bytes: Uint8Array;
  readonly fileName: string;
}

export class TechnicalReportsService {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly scheduleService: TechnicalReportSyncScheduleService,
  ) {}

  public async getReport(
    query: TechnicalReportQuery = {},
    referenceDate = new Date(),
  ): Promise<TechnicalReportResponse> {
    const weekOffset = query.weekOffset ?? 0;
    const { config, window, records } = await this.loadWindowOrders(
      weekOffset,
      query.technicianId,
      referenceDate,
    );

    const search = query.search?.trim().toLowerCase() ?? '';
    const filteredRecords = records.filter((record) => {
      if (query.serviceType && !matchesServiceType(record, query.serviceType)) return false;
      if (!search) return true;
      return matchesSearch(record, search);
    });

    const orders = filteredRecords.map((record) => serializeReportOrder(record, config.timeZone));
    const groups = groupOrdersByTechnician(orders, filteredRecords);

    let baseCents = 0;
    let travelCents = 0;
    let dhlCents = 0;
    let totalEquipment = 0;

    for (const order of orders) {
      baseCents += toCents(order.baseCost);
      travelCents += toCents(order.travelExpenses);
      dhlCents += toCents(order.dhlShippingCost);
      totalEquipment += order.equipmentCount;
    }

    return {
      window: {
        weekOffset,
        isoWeek: getIsoWeek(window.end, config.timeZone),
        start: window.start.toISOString(),
        end: window.end.toISOString(),
        cutoffWeekday: config.cutoffWeekday,
        timeZone: config.timeZone,
      },
      summary: {
        totalOrders: orders.length,
        totalTechnicians: groups.length,
        totalEquipment,
        baseCost: fromCents(baseCents),
        travelExpenses: fromCents(travelCents),
        dhlShippingCost: fromCents(dhlCents),
        grandTotal: fromCents(baseCents + travelCents + dhlCents),
        currency: 'MXN',
      },
      groups,
    };
  }

  public async updateOrderDhlShipping(
    actorUserId: string,
    orderId: string,
    input: UpdateOrderDhlShipping,
  ): Promise<TechnicalReportOrder> {
    const config = await this.scheduleService.getConfig();

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.order.findUnique({
        where: { id: orderId },
        select: technicalReportOrderSelection,
      });

      if (!existing) {
        throw new AppError(404, 'ORDER_NOT_FOUND', 'La orden no existe.');
      }

      if (!(REPORTABLE_STATUSES as readonly string[]).includes(existing.status)) {
        throw new AppError(
          409,
          'ORDER_NOT_REPORTABLE',
          'Solo se puede registrar envío DHL en órdenes completadas o citas fallidas.',
        );
      }

      const nextValue =
        input.dhlShippingCost === null ? null : input.dhlShippingCost.toFixed(2);

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { dhlShippingCost: nextValue },
        select: technicalReportOrderSelection,
      });

      await tx.auditLog.create({
        data: {
          action: 'ORDER_DHL_SHIPPING_UPDATED',
          actorUserId,
          entityType: 'Order',
          entityId: orderId,
          before: {
            dhlShippingCost: existing.dhlShippingCost
              ? Number(existing.dhlShippingCost.toFixed(2))
              : null,
          },
          after: {
            dhlShippingCost: input.dhlShippingCost,
          },
        },
      });

      return serializeReportOrder(updated, config.timeZone);
    });
  }

  public async exportExcel(
    query: TechnicalReportExportQuery = {},
    referenceDate = new Date(),
  ): Promise<TechnicalReportExportResult> {
    const weekOffset = query.weekOffset ?? 0;
    const { config, window, records } = await this.loadWindowOrders(
      weekOffset,
      query.technicianId,
      referenceDate,
    );

    const isoWeek = getIsoWeek(window.end, config.timeZone);

    if (query.technicianId) {
      const first = records[0];
      const tech = first?.technician
        ? {
            id: first.technician.id,
            name: first.technician.name,
            externalKey: first.technician.externalKey,
          }
        : await this.prisma.technician.findUnique({
            where: { id: query.technicianId },
            select: { id: true, name: true, externalKey: true },
          });

      if (!tech) {
        throw new AppError(404, 'TECHNICIAN_NOT_FOUND', 'El técnico no existe.');
      }

      const safeName = tech.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 50);

      const bytes = await generateTechnicianExcelReport(tech, records, config.timeZone, {
        includeDhl: true,
      });
      return {
        bytes,
        fileName: `Reporte_${safeName}_Semana_${isoWeek}.xlsx`,
      };
    }

    const bytes = await generateConsolidatedExcelReport(records, config.timeZone, {
      includeDhl: true,
    });
    return {
      bytes,
      fileName: `Reporte_Tecnico_Consolidado_Semana_${isoWeek}.xlsx`,
    };
  }

  private async loadWindowOrders(
    weekOffset: number,
    technicianId: string | undefined,
    referenceDate: Date,
  ) {
    const shiftedReference = new Date(referenceDate.getTime() + weekOffset * MS_PER_WEEK);
    const config = await this.scheduleService.getConfig(shiftedReference);
    const window = calculateCurrentCutoffWindow(shiftedReference, config);

    const records = await this.prisma.order.findMany({
      where: {
        ...(technicianId ? { technicianId } : {}),
        OR: [
          {
            status: { in: ['COMPLETED', 'FAILED_APPOINTMENT'] },
            completedAt: { gte: window.start, lte: window.end },
          },
          {
            status: 'FAILED_APPOINTMENT',
            completedAt: null,
            scheduledAt: { gte: window.start, lte: window.end },
          },
        ],
      },
      select: technicalReportOrderSelection,
      orderBy: [{ scheduledAt: 'asc' }, { folio: 'asc' }],
    });

    return { config, window, records };
  }
}

function matchesServiceType(record: SelectedReportOrder, serviceType: string): boolean {
  if (record.status === 'FAILED_APPOINTMENT') return serviceType === 'FAILED_APPOINTMENT';
  if (record.serviceType === serviceType) return true;
  return record.units.some((unit) => unit.serviceType === serviceType);
}

function matchesSearch(record: SelectedReportOrder, query: string): boolean {
  if (record.folio.toLowerCase().includes(query)) return true;
  if (record.clientNameSnapshot.toLowerCase().includes(query)) return true;
  const techName = (record.technician?.name ?? record.technicianNameSnapshot ?? '').toLowerCase();
  if (techName.includes(query)) return true;
  if (record.technician?.legalName?.toLowerCase().includes(query)) return true;
  return record.units.some(
    (unit) =>
      unit.label.toLowerCase().includes(query) ||
      unit.serialNumber.toLowerCase().includes(query) ||
      unit.equipment.some(
        (eq) =>
          (eq.imei?.toLowerCase().includes(query) ?? false) ||
          (eq.externalId?.toLowerCase().includes(query) ?? false) ||
          eq.externalKey.toLowerCase().includes(query),
      ),
  );
}

function serializeReportOrder(
  record: SelectedReportOrder,
  timeZone: string,
): TechnicalReportOrder {
  const baseCents = toCents(record.pricingBaseCost);
  const travelCents = toCents(record.pricingTravelExpenses);
  const dhlCents = toCents(record.dhlShippingCost);
  const pricingTotalCents =
    record.pricingTotal !== null && record.pricingTotal !== undefined
      ? toCents(record.pricingTotal)
      : baseCents + travelCents;
  const totalCents = pricingTotalCents + dhlCents;

  const isFailed = record.status === 'FAILED_APPOINTMENT';
  const distinctTypes = Array.from(
    new Set(
      isFailed
        ? (['FAILED_APPOINTMENT'] as const)
        : record.units.length > 0
          ? record.units.map((unit) => unit.serviceType ?? record.serviceType)
          : [record.serviceType],
    ),
  );
  const serviceLabel = distinctTypes.map((type) => ORDER_SERVICE_LABELS[type] ?? type).join(' / ');

  const units = record.units.map((unit) => ({
    id: unit.id,
    label: unit.label,
    serialNumber: unit.serialNumber,
    serviceType: unit.serviceType,
    equipmentIdentifiers: unit.equipment
      .map((eq) => (eq.imei || eq.externalId || eq.externalKey || '').trim())
      .filter((id) => id.length > 0),
  }));

  const equipmentCount = units.reduce((sum, unit) => sum + unit.equipmentIdentifiers.length, 0);

  let notes = (record.generalNotes ?? '').trim();
  const failedReason = (record.failedReason ?? '').trim();
  if ((isFailed || failedReason.length > 0) && failedReason.length > 0) {
    const reasonText = `Motivo cita fallida: ${failedReason}`;
    notes = notes ? `${reasonText} | ${notes}` : reasonText;
  }

  return {
    id: record.id,
    folio: record.folio,
    isoWeek: getIsoWeek(record.scheduledAt, timeZone),
    scheduledAt: record.scheduledAt.toISOString(),
    completedAt: record.completedAt ? record.completedAt.toISOString() : null,
    status: record.status,
    serviceType: isFailed ? 'FAILED_APPOINTMENT' : record.serviceType,
    serviceLabel,
    clientName: record.clientNameSnapshot,
    technicianId: record.technicianId,
    technicianName: (record.technician?.name ?? record.technicianNameSnapshot ?? 'Sin técnico').trim(),
    technicianLegalName: record.technician?.legalName ?? null,
    technicianTaxData: record.technician?.taxData ?? null,
    baseCost: fromCents(baseCents),
    travelExpenses: fromCents(travelCents),
    dhlShippingCost: fromCents(dhlCents),
    total: fromCents(totalCents),
    currency: record.pricingCurrency ?? 'MXN',
    notes: notes.length > 0 ? notes : null,
    unitsCount: units.length,
    equipmentCount,
    units,
  };
}

function groupOrdersByTechnician(
  orders: ReadonlyArray<TechnicalReportOrder>,
  records: ReadonlyArray<SelectedReportOrder>,
): TechnicalReportTechnicianGroup[] {
  const externalKeyById = new Map<string, string | null>();
  for (const record of records) {
    if (record.technician) {
      externalKeyById.set(record.technician.id, record.technician.externalKey);
    }
  }

  const map = new Map<
    string,
    {
      technicianId: string | null;
      technicianName: string;
      legalName: string | null;
      taxData: string | null;
      externalKey: string | null;
      baseCents: number;
      travelCents: number;
      dhlCents: number;
      totalCents: number;
      equipmentCount: number;
      orders: TechnicalReportOrder[];
    }
  >();

  for (const order of orders) {
    const key = order.technicianId ?? `unassigned:${order.technicianName}`;
    let group = map.get(key);
    if (!group) {
      group = {
        technicianId: order.technicianId,
        technicianName: order.technicianName,
        legalName: order.technicianLegalName,
        taxData: order.technicianTaxData,
        externalKey: order.technicianId ? (externalKeyById.get(order.technicianId) ?? null) : null,
        baseCents: 0,
        travelCents: 0,
        dhlCents: 0,
        totalCents: 0,
        equipmentCount: 0,
        orders: [],
      };
      map.set(key, group);
    }

    group.baseCents += toCents(order.baseCost);
    group.travelCents += toCents(order.travelExpenses);
    group.dhlCents += toCents(order.dhlShippingCost);
    group.totalCents += toCents(order.total);
    group.equipmentCount += order.equipmentCount;
    group.orders.push(order);
  }

  return Array.from(map.values())
    .sort((a, b) => a.technicianName.localeCompare(b.technicianName, 'es-MX'))
    .map((group) => ({
      technicianId: group.technicianId,
      technicianName: group.technicianName,
      legalName: group.legalName,
      taxData: group.taxData,
      externalKey: group.externalKey,
      orderCount: group.orders.length,
      equipmentCount: group.equipmentCount,
      baseCost: fromCents(group.baseCents),
      travelExpenses: fromCents(group.travelCents),
      dhlShippingCost: fromCents(group.dhlCents),
      total: fromCents(group.totalCents),
      orders: group.orders,
    }));
}

function toCents(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (
    typeof value === 'object' &&
    typeof (value as { toFixed?: unknown }).toFixed === 'function'
  ) {
    const numeric = Number((value as { toFixed(digits: number): string }).toFixed(2));
    return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
}

function fromCents(cents: number): number {
  return Number((cents / 100).toFixed(2));
}
