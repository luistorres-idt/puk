import type { PrismaClient } from '../../generated/prisma/client.js';
import { SyncStatus } from '../../generated/prisma/client.js';
import type { SheetsPort, TechnicalReportRowInput } from '../../integrations/ports.js';
import { metrics } from '../../observability/metrics.js';
import { redact } from '../../observability/redaction.js';
import { AppError } from '../../shared/errors.js';

export interface SyncServiceOptions {
  maxRetries?: number;
}

export class SyncService {
  private readonly maxRetries: number;

  public constructor(
    private readonly prisma: PrismaClient,
    private readonly sheetsPort?: SheetsPort,
    options: SyncServiceOptions = {},
  ) {
    this.maxRetries = options.maxRetries ?? 5;
  }

  public async getOrderSyncStatus(orderId: string) {
    const operations = await this.prisma.sheetSyncOperation.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });

    const total = operations.length;
    const synced = operations.filter((op) => op.status === SyncStatus.SYNCED).length;
    const failed = operations.filter((op) => op.status === SyncStatus.FAILED).length;
    const pending = operations.filter(
      (op) => op.status === SyncStatus.PENDING || op.status === SyncStatus.PROCESSING,
    ).length;

    const equipmentOps = operations.filter((op) => op.operationType === 'SHEET_EQUIPMENT_ASSIGNMENT');
    const reportOps = operations.filter((op) => op.operationType === 'SHEET_TECHNICAL_REPORT');

    const summarize = (list: typeof operations) => ({
      total: list.length,
      synced: list.filter((op) => op.status === SyncStatus.SYNCED).length,
      failed: list.filter((op) => op.status === SyncStatus.FAILED).length,
      pending: list.filter(
        (op) => op.status === SyncStatus.PENDING || op.status === SyncStatus.PROCESSING,
      ).length,
    });

    return {
      orderId,
      isFullySynced: total > 0 && synced === total,
      total,
      synced,
      failed,
      pending,
      equipmentSync: summarize(equipmentOps),
      reportSync: summarize(reportOps),
      operations,
    };
  }

  public async retryFailedOperations(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Orden no encontrada');
    }

    const updated = await this.prisma.sheetSyncOperation.updateMany({
      where: {
        orderId,
        status: SyncStatus.FAILED,
      },
      data: {
        status: SyncStatus.PENDING,
        attempts: 0,
        nextAttemptAt: new Date(),
        lastErrorMessage: null,
        lastErrorCode: null,
      },
    });

    return { retriedCount: updated.count };
  }

  public async processPendingOperations(): Promise<number> {
    if (!this.sheetsPort) {
      return 0;
    }

    const now = new Date();
    const pendingOps = await this.prisma.sheetSyncOperation.findMany({
      where: {
        OR: [
          { status: SyncStatus.PENDING },
          { status: SyncStatus.FAILED, nextAttemptAt: { lte: now } },
        ],
      },
      take: 20,
    });

    let processed = 0;

    for (const op of pendingOps) {
      if (op.attempts >= this.maxRetries && op.status === SyncStatus.FAILED) {
        continue;
      }

      await this.prisma.sheetSyncOperation.update({
        where: { id: op.id },
        data: { status: SyncStatus.PROCESSING },
      });

      try {
        if (op.operationType === 'SHEET_TECHNICAL_REPORT') {
          const payload = op.payload as unknown as TechnicalReportRowInput;
          await this.sheetsPort.syncTechnicalReportRow(payload);
        } else {
          const payload = op.payload as {
            externalKey: string;
            row: number;
            values: Record<'J' | 'K' | 'L' | 'M' | 'N' | 'O' | 'P', string>;
          };

          // Re-locate row by external key to guarantee row accuracy
          let targetRow = payload.row;
          const equipment = await this.sheetsPort.findEquipment({
            externalId: payload.externalKey,
            imei: payload.externalKey,
          });

          if (equipment) {
            targetRow = equipment.row;
          }

          if (targetRow > 1) {
            await this.sheetsPort.updateAssignment({
              row: targetRow,
              values: payload.values,
            });
          }
        }

        await this.prisma.sheetSyncOperation.update({
          where: { id: op.id },
          data: {
            status: SyncStatus.SYNCED,
            syncedAt: new Date(),
            updatedAt: new Date(),
          },
        });

        metrics.recordSheetsOperation('COMPLETED', op.operationType);
        processed++;
      } catch (err: unknown) {
        const error = err as Error;
        const nextAttempts = op.attempts + 1;
        const jitter = Math.floor(Math.random() * 500);
        const backoffMs = Math.min(1000 * Math.pow(2, nextAttempts) + jitter, 60_000);
        const nextAttemptAt = new Date(Date.now() + backoffMs);

        await this.prisma.sheetSyncOperation.update({
          where: { id: op.id },
          data: {
            status: nextAttempts >= this.maxRetries ? SyncStatus.FAILED : SyncStatus.PENDING,
            attempts: nextAttempts,
            nextAttemptAt,
            lastErrorCode: error.name || 'SYNC_ERROR',
            lastErrorMessage: String(redact(error.message || 'Error desconocido de sincronización')),
            updatedAt: new Date(),
          },
        });

        metrics.recordSheetsOperation('FAILED', op.operationType);
      }
    }

    return processed;
  }
}
