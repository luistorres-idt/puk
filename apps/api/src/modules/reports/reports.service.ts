import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { OrderStatus, ReportStatus } from '../../generated/prisma/enums.js';
import type { ObjectStoragePort } from '../../integrations/ports.js';
import { AppError } from '../../shared/errors.js';
import { ServiceOrderReportGenerator } from './report-generator.js';

export class ReportsService {
  private readonly generator: ServiceOrderReportGenerator;

  public constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: ObjectStoragePort,
    private readonly downloadUrlTtlSeconds = 300,
  ) {
    this.generator = new ServiceOrderReportGenerator(storage);
  }

  public async requestGeneration(orderId: string, actorUserId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, completedAt: true },
    });
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Orden no encontrada');
    if (order.status !== OrderStatus.COMPLETED || !order.completedAt) {
      throw new AppError(
        400,
        'REPORT_ORDER_NOT_COMPLETED',
        'El reporte solo puede generarse para una orden completada',
      );
    }

    const latest = await this.prisma.serviceOrderReport.findFirst({
      where: { orderId },
      orderBy: { version: 'desc' },
    });
    if (latest && latest.createdAt >= order.completedAt) {
      if (latest.status === ReportStatus.FAILED) {
        const [retried] = await this.prisma.$transaction([
          this.prisma.serviceOrderReport.update({
            where: { id: latest.id },
            data: { status: ReportStatus.PENDING, failureReason: null },
          }),
          this.prisma.auditLog.create({
            data: {
              action: 'SERVICE_ORDER_REPORT_RETRIED',
              ...(actorUserId ? { actorUserId } : {}),
              entityType: 'ServiceOrderReport',
              entityId: latest.id,
            },
          }),
        ]);
        return retried;
      }
      return latest;
    }

    let report;
    try {
      report = await this.prisma.serviceOrderReport.create({
        data: { orderId, version: (latest?.version ?? 0) + 1 },
      });
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      const concurrent = await this.prisma.serviceOrderReport.findFirst({
        where: { orderId },
        orderBy: { version: 'desc' },
      });
      if (!concurrent) throw error;
      return concurrent;
    }
    await this.prisma.auditLog.create({
      data: {
        action: 'SERVICE_ORDER_REPORT_REQUESTED',
        ...(actorUserId ? { actorUserId } : {}),
        entityType: 'ServiceOrderReport',
        entityId: report.id,
        after: { orderId, version: report.version },
      },
    });
    return report;
  }

  public async getCurrent(orderId: string, userId: string, role: 'ADMIN' | 'TECHNICIAN') {
    await this.assertAccess(orderId, userId, role);
    return this.prisma.serviceOrderReport.findFirst({
      where: { orderId },
      orderBy: { version: 'desc' },
      select: this.publicReportSelection(),
    });
  }

  public async listVersions(orderId: string, userId: string, role: 'ADMIN' | 'TECHNICIAN') {
    await this.assertAccess(orderId, userId, role);
    return this.prisma.serviceOrderReport.findMany({
      where: { orderId },
      orderBy: { version: 'desc' },
      select: this.publicReportSelection(),
    });
  }

  public async getDownloadUrl(orderId: string, userId: string, role: 'ADMIN' | 'TECHNICIAN') {
    await this.assertAccess(orderId, userId, role);
    const report = await this.prisma.serviceOrderReport.findFirst({
      where: { orderId },
      orderBy: { version: 'desc' },
    });
    if (!report) throw new AppError(404, 'REPORT_NOT_FOUND', 'El reporte todavía no existe');
    if (report.status !== ReportStatus.READY || !report.objectKey) {
      throw new AppError(409, 'REPORT_NOT_READY', 'El reporte todavía no está listo para descarga');
    }
    const url = await this.storage.createDownloadUrl(report.objectKey, this.downloadUrlTtlSeconds);
    await this.prisma.auditLog.create({
      data: {
        action: 'SERVICE_ORDER_REPORT_DOWNLOADED',
        actorUserId: userId,
        entityType: 'ServiceOrderReport',
        entityId: report.id,
      },
    });
    return {
      url,
      expiresInSeconds: this.downloadUrlTtlSeconds,
      fileName: `orden-servicio-${this.safeFileName((await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { folio: true } })).folio)}-v${report.version}.pdf`,
    };
  }

  public async processPendingReports(limit = 2): Promise<number> {
    await this.prisma.serviceOrderReport.updateMany({
      where: {
        status: ReportStatus.PROCESSING,
        updatedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) },
      },
      data: {
        status: ReportStatus.PENDING,
        failureReason: 'La generación anterior fue interrumpida y se reintentará.',
      },
    });
    const pending = await this.prisma.serviceOrderReport.findMany({
      where: { status: ReportStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    let processed = 0;
    for (const report of pending) {
      const claimed = await this.prisma.serviceOrderReport.updateMany({
        where: { id: report.id, status: ReportStatus.PENDING },
        data: { status: ReportStatus.PROCESSING, failureReason: null },
      });
      if (claimed.count === 0) continue;
      processed += 1;
      try {
        await this.generateReport(report.id);
      } catch (error) {
        const reason = this.sanitizeFailure(error);
        await this.prisma.$transaction([
          this.prisma.serviceOrderReport.update({
            where: { id: report.id },
            data: { status: ReportStatus.FAILED, failureReason: reason },
          }),
          this.prisma.auditLog.create({
            data: {
              action: 'SERVICE_ORDER_REPORT_FAILED',
              entityType: 'ServiceOrderReport',
              entityId: report.id,
              after: { reason },
            },
          }),
        ]);
      }
    }
    return processed;
  }

  private async generateReport(reportId: string): Promise<void> {
    const report = await this.prisma.serviceOrderReport.findUniqueOrThrow({
      where: { id: reportId },
    });
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: report.orderId },
      include: {
        technician: { select: { name: true, workshop: true } },
        signature: { select: { signerName: true, objectKey: true, signedAt: true } },
        units: {
          orderBy: { createdAt: 'asc' },
          include: {
            equipment: { orderBy: { createdAt: 'asc' } },
            discrepancies: { orderBy: { reportedAt: 'asc' } },
            checklist: {
              include: {
                items: {
                  include: {
                    evidence: {
                      where: { status: 'COMPLETED', deletedAt: null },
                      orderBy: { createdAt: 'asc' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (order.status !== OrderStatus.COMPLETED)
      throw new Error('La orden dejó de estar completada');

    const generated = await this.generator.generate(order, report.version);
    const objectKey = `orders/${order.id}/reports/${report.id}.pdf`;
    await this.storage.putObject(objectKey, generated.bytes, 'application/pdf');
    await this.prisma.$transaction([
      this.prisma.serviceOrderReport.update({
        where: { id: report.id },
        data: {
          status: ReportStatus.READY,
          objectKey,
          sizeBytes: generated.bytes.byteLength,
          checksum: generated.checksum,
          generatedAt: new Date(),
          failureReason: null,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          action: 'SERVICE_ORDER_REPORT_GENERATED',
          entityType: 'ServiceOrderReport',
          entityId: report.id,
          after: {
            orderId: order.id,
            version: report.version,
            checksum: generated.checksum,
          } as Prisma.InputJsonValue,
        },
      }),
    ]);
  }

  private async assertAccess(orderId: string, userId: string, role: 'ADMIN' | 'TECHNICIAN') {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { technicianId: true },
    });
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Orden no encontrada');
    if (role === 'ADMIN') return;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { technicianId: true },
    });
    if (!user?.technicianId || user.technicianId !== order.technicianId) {
      throw new AppError(403, 'FORBIDDEN', 'No tienes acceso al reporte de esta orden');
    }
  }

  private safeFileName(value: string): string {
    return value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-');
  }

  private publicReportSelection() {
    return {
      id: true,
      orderId: true,
      version: true,
      status: true,
      mimeType: true,
      sizeBytes: true,
      checksum: true,
      failureReason: true,
      generatedAt: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }

  private sanitizeFailure(error: unknown): string {
    const generic =
      'No fue posible generar el reporte. Verifique las evidencias e intente nuevamente.';
    if (!(error instanceof Error)) return generic;
    const safeMessages = [
      'No se encontró un recurso requerido para el reporte',
      'No fue posible procesar una imagen requerida para el reporte',
      'La orden dejó de estar completada',
    ];
    return safeMessages.includes(error.message) ? error.message : generic;
  }
}
