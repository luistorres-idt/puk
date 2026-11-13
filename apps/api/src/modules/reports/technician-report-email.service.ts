import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { ReportMailPort } from '../../integrations/gmail/gmail.client.js';
import { logger } from '../../observability/logger.js';
import {
  calculateCurrentCutoffWindow,
  calculateTechnicalReportSyncAt,
  type TechnicalReportSyncScheduleService,
} from '../orders/index.js';
import { formatReportDate, getIsoWeek } from './technical-report-formatter.js';
import {
  generateConsolidatedExcelReport,
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
  readonly recipient?: string | null;
  readonly consolidatedRecipient?: string | null;
  readonly consolidatedSent?: boolean;
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

    if (!config.adminRecipientEmail && !config.consolidatedRecipientEmail) {
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
        recipient: config.adminRecipientEmail ?? null,
        consolidatedRecipient: config.consolidatedRecipientEmail ?? null,
        results: [],
      };
    }

    const results: TechnicianEmailResult[] = [];
    const attemptBatchId = randomUUID();
    const cutoffDateStr = formatReportDate(window.end, config.timeZone);

    if (config.adminRecipientEmail) {
      const groups = this.groupOrdersByTechnician(orders);

      for (const [technicianId, group] of groups) {
        const sem = this.resolveIsoWeek(group.orders, window.end, config.timeZone);
        const safeTechName = group.technician.name
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .slice(0, 50);

        const delivery = await this.sendAndAuditReport({
          actorUserId,
          actions: {
            attempted: 'TECHNICIAN_REPORT_EMAIL_ATTEMPTED',
            sent: 'TECHNICIAN_REPORT_EMAIL_SENT',
            failed: 'TECHNICIAN_REPORT_EMAIL_FAILED',
          },
          entityType: 'Technician',
          entityId: technicianId,
          auditPayload: {
            attemptBatchId,
            attemptId: randomUUID(),
            technicianId,
            technicianName: group.technician.name,
            adminRecipient: config.adminRecipientEmail,
            cutoffEnd: window.end.toISOString(),
            orderCount: group.orders.length,
          },
          errorLogMessage: 'Falló el despacho de reporte técnico semanal por correo',
          errorLogContext: { technicianId, technicianName: group.technician.name },
          buildMail: async () => ({
            recipient: config.adminRecipientEmail!,
            subject: `Reporte técnico - ${group.technician.name} - Semana ${sem} (${group.orders.length} órdenes)`,
            text: `Adjuntamos el desglose de servicios en Excel del técnico ${group.technician.name} correspondiente al corte del ${cutoffDateStr}.`,
            attachment: {
              fileName: `Reporte_${safeTechName}_Semana_${sem}.xlsx`,
              contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              content: await generateTechnicianExcelReport(
                group.technician,
                group.orders,
                config.timeZone,
              ),
            },
          }),
        });

        results.push({
          technicianId,
          technicianName: group.technician.name,
          orderCount: group.orders.length,
          ...(delivery.sent
            ? { status: 'SENT', messageId: delivery.messageId }
            : { status: 'FAILED', failureCode: 'DELIVERY_UNCONFIRMED' }),
        });
      }
    }

    let consolidatedSent: boolean | undefined;

    if (config.consolidatedRecipientEmail) {
      const consolidatedSem = this.resolveIsoWeek(orders, window.end, config.timeZone);
      const delivery = await this.sendAndAuditReport({
        actorUserId,
        actions: {
          attempted: 'CONSOLIDATED_REPORT_EMAIL_ATTEMPTED',
          sent: 'CONSOLIDATED_REPORT_EMAIL_SENT',
          failed: 'CONSOLIDATED_REPORT_EMAIL_FAILED',
        },
        entityType: 'TechnicalReportSyncSchedule',
        entityId: 'technical-report',
        auditPayload: {
          attemptBatchId,
          attemptId: randomUUID(),
          consolidatedRecipient: config.consolidatedRecipientEmail,
          cutoffEnd: window.end.toISOString(),
          orderCount: orders.length,
        },
        errorLogMessage: 'Falló el despacho de reporte técnico consolidado por correo',
        errorLogContext: { recipient: config.consolidatedRecipientEmail },
        buildMail: async () => ({
          recipient: config.consolidatedRecipientEmail!,
          subject: `Reporte técnico consolidado - Semana ${consolidatedSem} (${orders.length} órdenes)`,
          text: `Adjuntamos el desglose consolidado de servicios en Excel correspondiente al corte del ${cutoffDateStr} (${orders.length} órdenes).`,
          attachment: {
            fileName: `Reporte_Consolidado_Semana_${consolidatedSem}.xlsx`,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            content: await generateConsolidatedExcelReport(orders, config.timeZone),
          },
        }),
      });
      consolidatedSent = delivery.sent;
    }

    const techSentCount = results.filter((r) => r.status === 'SENT').length;
    const techFailedCount = results.filter((r) => r.status === 'FAILED').length;

    const hasConsolidated = Boolean(config.consolidatedRecipientEmail);
    const totalSentCount = techSentCount + (consolidatedSent === true ? 1 : 0);
    const totalFailedCount = techFailedCount + (consolidatedSent === false ? 1 : 0);
    const totalExpected = results.length + (hasConsolidated ? 1 : 0);

    const status =
      totalSentCount === totalExpected
        ? 'SUCCESS'
        : totalSentCount === 0
          ? 'FAILURE'
          : 'PARTIAL_FAILURE';

    return {
      status,
      sentCount: totalSentCount,
      failedCount: totalFailedCount,
      recipient: config.adminRecipientEmail ?? null,
      consolidatedRecipient: config.consolidatedRecipientEmail ?? null,
      ...(consolidatedSent !== undefined ? { consolidatedSent } : {}),
      results,
    };
  }

  private resolveIsoWeek(
    orders: ReadonlyArray<{ readonly scheduledAt: Date }>,
    fallbackDate: Date,
    timeZone: string,
  ): number {
    return orders[0]
      ? getIsoWeek(orders[0].scheduledAt, timeZone)
      : getIsoWeek(fallbackDate, timeZone);
  }

  private groupOrdersByTechnician<
    T extends {
      readonly technicianId: string | null;
      readonly technician: { readonly name: string; readonly externalKey: string | null } | null;
      readonly technicianNameSnapshot: string | null;
      readonly technicianExternalKeySnapshot: string | null;
    },
  >(orders: ReadonlyArray<T>): Map<string, { technician: TechnicianSummary; orders: T[] }> {
    const groups = new Map<string, { technician: TechnicianSummary; orders: T[] }>();
    for (const order of orders) {
      const techId = order.technicianId!;
      const existing = groups.get(techId);
      if (existing) {
        existing.orders.push(order);
      } else {
        groups.set(techId, {
          technician: {
            id: techId,
            name: order.technician?.name ?? order.technicianNameSnapshot ?? 'Técnico',
            externalKey: order.technician?.externalKey ?? order.technicianExternalKeySnapshot,
          },
          orders: [order],
        });
      }
    }
    return groups;
  }

  private async sendAndAuditReport(params: {
    actorUserId?: string | null | undefined;
    actions: { attempted: string; sent: string; failed: string };
    entityType: string;
    entityId: string;
    auditPayload: Record<string, string | number | boolean | null>;
    errorLogMessage: string;
    errorLogContext: Record<string, unknown>;
    buildMail: () => Promise<Parameters<ReportMailPort['send']>[0]>;
  }): Promise<{ sent: true; messageId: string } | { sent: false }> {
    const { actorUserId, actions, entityType, entityId, auditPayload } = params;
    const actorField = actorUserId ? { actorUserId } : {};

    await this.prisma.auditLog.create({
      data: {
        action: actions.attempted,
        ...actorField,
        entityType,
        entityId,
        after: auditPayload,
      },
    });

    try {
      const mail = await params.buildMail();
      const delivered = await this.sender!.send(mail);

      await this.prisma.auditLog.create({
        data: {
          action: actions.sent,
          ...actorField,
          entityType,
          entityId,
          after: {
            ...auditPayload,
            messageId: delivered.messageId,
            status: 'SENT',
          },
        },
      });

      return { sent: true, messageId: delivered.messageId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(params.errorLogMessage, { ...params.errorLogContext, error: errorMessage });

      await this.prisma.auditLog.create({
        data: {
          action: actions.failed,
          ...actorField,
          entityType,
          entityId,
          after: {
            ...auditPayload,
            status: 'FAILED',
            failureCode: 'DELIVERY_UNCONFIRMED',
            errorMessage,
          },
        },
      });

      return { sent: false };
    }
  }

  public async processScheduledDispatch(
    reference = new Date(),
  ): Promise<DispatchTechnicianReportsOutcome | null> {
    if (!this.sender) {
      return null;
    }

    const config = await this.scheduleService.getConfig(reference);
    if (!config.adminRecipientEmail && !config.consolidatedRecipientEmail) {
      return null;
    }

    const window = calculateCurrentCutoffWindow(reference, config);
    const syncAt = calculateTechnicalReportSyncAt(window.end, config);

    // If we have not reached the scheduled sync time for this cutoff window yet, skip
    if (reference.getTime() < syncAt.getTime()) {
      return null;
    }

    // Idempotency check: has this cutoff window already been processed?
    const batchKey = `batch-${window.end.toISOString()}`;
    const alreadyProcessed = await this.prisma.auditLog.findFirst({
      where: {
        action: 'TECHNICIAN_REPORT_EMAIL_BATCH_PROCESSED',
        entityType: 'TechnicalReportSyncSchedule',
        entityId: batchKey,
      },
    });

    if (alreadyProcessed) {
      return null;
    }

    // Claim the batch so concurrent ticks do not double-dispatch
    await this.prisma.auditLog.create({
      data: {
        action: 'TECHNICIAN_REPORT_EMAIL_BATCH_PROCESSED',
        entityType: 'TechnicalReportSyncSchedule',
        entityId: batchKey,
        after: {
          cutoffEnd: window.end.toISOString(),
          scheduledSyncAt: syncAt.toISOString(),
          dispatchedAt: reference.toISOString(),
          adminRecipient: config.adminRecipientEmail,
          consolidatedRecipient: config.consolidatedRecipientEmail,
        },
      },
    });

    return await this.dispatchWeeklyReports(undefined, { forceDateWindow: window });
  }
}
