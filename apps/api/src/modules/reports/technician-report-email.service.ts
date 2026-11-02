import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { ReportMailPort } from '../../integrations/gmail/gmail.client.js';
import {
  calculateCurrentCutoffWindow,
  type TechnicalReportSyncScheduleService,
} from '../orders/index.js';
import { formatReportDate, getIsoWeek } from './technical-report-formatter.js';
import {
  generateTechnicianExcelReport,
  type TechnicianSummary,
} from './technician-excel-report.generator.js';

export interface DispatchTechnicianReportsOptions {
  readonly referenceDate?: Date;
  readonly forceDateWindow?: { readonly start: Date; readonly end: Date };
}

export interface TechnicianEmailResult {
  readonly technicianId: string;
  readonly technicianName: string;
  readonly orderCount: number;
  readonly status: 'SENT' | 'FAILED';
  readonly messageId?: string;
  readonly failureCode?: string;
}

export interface DispatchTechnicianReportsOutcome {
  readonly status: 'SUCCESS' | 'PARTIAL_FAILURE' | 'FAILURE' | 'NO_ORDERS' | 'SKIPPED';
  readonly reason?: string;
  readonly sentCount: number;
  readonly failedCount: number;
  readonly recipient?: string;
  readonly results: ReadonlyArray<TechnicianEmailResult>;
}

export class TechnicianReportEmailService {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly scheduleService: TechnicalReportSyncScheduleService,
    private readonly sender?: ReportMailPort,
  ) {}

  public async dispatchWeeklyReports(
    actorUserId?: string | null,
    options: DispatchTechnicianReportsOptions = {},
  ): Promise<DispatchTechnicianReportsOutcome> {
    if (!this.sender) {
      return {
        status: 'SKIPPED',
        reason: 'EMAIL_SENDER_NOT_CONFIGURED',
        sentCount: 0,
        failedCount: 0,
        results: [],
      };
    }

    const reference = options.referenceDate ?? new Date();
    const config = await this.scheduleService.getConfig(reference);

    if (!config.adminRecipientEmail) {
      return {
        status: 'SKIPPED',
        reason: 'ADMIN_RECIPIENT_EMAIL_NOT_CONFIGURED',
        sentCount: 0,
        failedCount: 0,
        results: [],
      };
    }

    const window = options.forceDateWindow ?? calculateCurrentCutoffWindow(reference, config);

    // Query completed orders in window
    const orders = await this.prisma.order.findMany({
      where: {
        status: 'COMPLETED',
        completedAt: {
          gte: window.start,
          lte: window.end,
        },
        technicianId: { not: null },
      },
      include: {
        technician: {
          select: {
            id: true,
            name: true,
            externalKey: true,
          },
        },
        units: {
          include: {
            equipment: true,
          },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    if (orders.length === 0) {
      return {
        status: 'NO_ORDERS',
        sentCount: 0,
        failedCount: 0,
        recipient: config.adminRecipientEmail,
        results: [],
      };
    }

    // Group orders by technician
    const groups = new Map<string, { technician: TechnicianSummary; orders: typeof orders }>();

    for (const order of orders) {
      const techId = order.technicianId!;
      const techName = order.technician?.name ?? order.technicianNameSnapshot ?? 'Técnico';
      const existing = groups.get(techId);
      if (existing) {
        existing.orders.push(order);
      } else {
        groups.set(techId, {
          technician: {
            id: techId,
            name: techName,
            externalKey: order.technician?.externalKey ?? order.technicianExternalKeySnapshot,
          },
          orders: [order],
        });
      }
    }

    const results: TechnicianEmailResult[] = [];
    const attemptBatchId = randomUUID();
    const cutoffDateStr = formatReportDate(window.end, config.timeZone);

    for (const [technicianId, group] of groups) {
      const sem = group.orders[0]
        ? getIsoWeek(group.orders[0].scheduledAt, config.timeZone)
        : getIsoWeek(window.end, config.timeZone);
      const attemptId = randomUUID();
      const auditPayload = {
        attemptBatchId,
        attemptId,
        technicianId,
        technicianName: group.technician.name,
        adminRecipient: config.adminRecipientEmail,
        cutoffEnd: window.end.toISOString(),
        orderCount: group.orders.length,
      };

      await this.prisma.auditLog.create({
        data: {
          action: 'TECHNICIAN_REPORT_EMAIL_ATTEMPTED',
          ...(actorUserId ? { actorUserId } : {}),
          entityType: 'Technician',
          entityId: technicianId,
          after: auditPayload,
        },
      });

      try {
        const excelBytes = await generateTechnicianExcelReport(
          group.technician,
          group.orders,
          config.timeZone,
        );

        const safeTechName = group.technician.name
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .slice(0, 50);
        const fileName = `Reporte_${safeTechName}_Semana_${sem}.xlsx`;

        const delivered = await this.sender.send({
          recipient: config.adminRecipientEmail,
          subject: `Reporte técnico - ${group.technician.name} - Semana ${sem} (${group.orders.length} órdenes)`,
          text: `Adjuntamos el desglose de servicios en Excel del técnico ${group.technician.name} correspondiente al corte del ${cutoffDateStr}.`,
          attachment: {
            fileName,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            content: excelBytes,
          },
        });

        await this.prisma.auditLog.create({
          data: {
            action: 'TECHNICIAN_REPORT_EMAIL_SENT',
            ...(actorUserId ? { actorUserId } : {}),
            entityType: 'Technician',
            entityId: technicianId,
            after: {
              ...auditPayload,
              messageId: delivered.messageId,
              status: 'SENT',
            },
          },
        });

        results.push({
          technicianId,
          technicianName: group.technician.name,
          orderCount: group.orders.length,
          status: 'SENT',
          messageId: delivered.messageId,
        });
      } catch {
        await this.prisma.auditLog.create({
          data: {
            action: 'TECHNICIAN_REPORT_EMAIL_FAILED',
            ...(actorUserId ? { actorUserId } : {}),
            entityType: 'Technician',
            entityId: technicianId,
            after: {
              ...auditPayload,
              status: 'FAILED',
              failureCode: 'DELIVERY_UNCONFIRMED',
            },
          },
        });

        results.push({
          technicianId,
          technicianName: group.technician.name,
          orderCount: group.orders.length,
          status: 'FAILED',
          failureCode: 'DELIVERY_UNCONFIRMED',
        });
      }
    }

    const sentCount = results.filter((r) => r.status === 'SENT').length;
    const failedCount = results.filter((r) => r.status === 'FAILED').length;

    return {
      status:
        sentCount === results.length ? 'SUCCESS' : sentCount === 0 ? 'FAILURE' : 'PARTIAL_FAILURE',
      sentCount,
      failedCount,
      recipient: config.adminRecipientEmail,
      results,
    };
  }
}
