import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { OrderStatus, ReportStatus } from '../../generated/prisma/enums.js';
import { assertIndividualTechnician } from '../../auth/order-access-policy.js';
import { AppError } from '../../shared/errors.js';
import {
  type ReportFileReader,
  type ReportGeneratorPort,
  ServiceOrderReportGenerator,
} from './report-generator.js';
import { storeReportPdf, type ReportDrivePort } from './report-storage.js';

export interface ReportsServiceOptions {
  generator?: ReportGeneratorPort;
  drive?: ReportDrivePort;
}

export class ReportsService {
  private readonly generator: ReportGeneratorPort;
  private readonly drive: ReportDrivePort | undefined;

  public constructor(
    private readonly prisma: PrismaClient,
    options: ReportsServiceOptions = {},
  ) {
    this.drive = options.drive;
    const fileReader: ReportFileReader = {
      getFile: (id) => this.requireDrive().client.getFile(id),
    };
    this.generator = options.generator ?? new ServiceOrderReportGenerator(fileReader);
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

  public async getDownloadFile(
    orderId: string,
    userId: string,
    role: 'ADMIN' | 'TECHNICIAN',
    version?: number,
  ) {
    const drive = this.requireDrive();
    await this.assertAccess(orderId, userId, role);
    const report = await this.prisma.serviceOrderReport.findFirst({
      where: { orderId, ...(version === undefined ? {} : { version }) },
      orderBy: { version: 'desc' },
    });
    if (!report) throw new AppError(404, 'REPORT_NOT_FOUND', 'El reporte todavía no existe');
    if (report.status !== ReportStatus.READY || !report.objectKey) {
      throw new AppError(409, 'REPORT_NOT_READY', 'El reporte todavía no está listo para descarga');
    }
    const bytes = await drive.client.getFile(report.objectKey);
    if (!bytes)
      throw new AppError(404, 'REPORT_FILE_NOT_FOUND', 'El archivo del reporte no existe');
    await this.prisma.auditLog.create({
      data: {
        action: 'SERVICE_ORDER_REPORT_DOWNLOADED',
        actorUserId: userId,
        entityType: 'ServiceOrderReport',
        entityId: report.id,
      },
    });
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { folio: true },
    });
    return {
      bytes,
      fileName: `orden-servicio-${this.safeFileName(order.folio)}-v${report.version}.pdf`,
    };
  }

  public async readReadyPdfForDelivery(orderId: string, reportId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true, folio: true },
    });
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'La orden no existe.');
    if (order.status !== OrderStatus.COMPLETED)
      throw new AppError(409, 'ORDER_NOT_COMPLETED', 'La orden debe estar completada.');
    const report = await this.prisma.serviceOrderReport.findFirst({
      where: { id: reportId, orderId },
    });
    if (!report)
      throw new AppError(404, 'REPORT_NOT_FOUND', 'El reporte no pertenece a esta orden.');
    if (report.status !== ReportStatus.READY || !report.objectKey)
      throw new AppError(409, 'REPORT_NOT_READY', 'El reporte todavía no está listo.');
    let bytes: Uint8Array | null;
    try {
      bytes = await this.requireDrive().client.getFile(report.objectKey);
    } catch {
      throw new AppError(503, 'REPORT_FILE_UNAVAILABLE', 'No se pudo leer el PDF para el envío.');
    }
    if (!bytes)
      throw new AppError(404, 'REPORT_FILE_NOT_FOUND', 'El archivo del reporte no existe.');
    return {
      bytes,
      reportId: report.id,
      version: report.version,
      fileName: `orden-servicio-${this.safeFileName(order.folio)}-v${report.version}.pdf`,
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
            evidence: {
              where: { status: 'COMPLETED', deletedAt: null },
              orderBy: { createdAt: 'asc' },
            },
            checklist: {
              include: {
                items: true,
              },
            },
          },
        },
      },
    });
    if (order.status !== OrderStatus.COMPLETED)
      throw new Error('La orden dejó de estar completada');

    const { objectKey, sizeBytes, checksum } = await storeReportPdf({
      prisma: this.prisma,
      generator: this.generator,
      drive: this.requireDrive(),
      order,
      report,
    });
    await this.prisma.$transaction([
      this.prisma.serviceOrderReport.update({
        where: { id: report.id },
        data: {
          status: ReportStatus.READY,
          objectKey,
          sizeBytes,
          checksum,
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
            checksum,
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
    await assertIndividualTechnician(
      this.prisma,
      { id: userId, role },
      'La cuenta compartida no puede acceder a reportes.',
    );
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

  private requireDrive(): ReportDrivePort {
    if (!this.drive) {
      throw new AppError(503, 'DRIVE_STORAGE_DISABLED', 'El almacenamiento de Drive no está configurado.');
    }
    return this.drive;
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
