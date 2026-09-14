import { afterEach, describe, expect, it, vi } from 'vitest';

import { SyncStatus, type PrismaClient } from '../../generated/prisma/client.js';

import {
  calculateTechnicalReportSyncAt,
  TechnicalReportSyncScheduleService,
} from './technical-report-sync-schedule.js';

const defaults = {
  cutoffWeekday: 2,
  syncTime: '17:00',
  syncWeekday: 3,
  timeZone: 'America/Hermosillo',
};

describe('calculateTechnicalReportSyncAt', () => {
  it('includes an order closed before the Tuesday cutoff in the current batch', () => {
    const result = calculateTechnicalReportSyncAt(new Date('2026-09-08T23:00:00.000Z'), defaults);
    expect(result.toISOString()).toBe('2026-09-10T00:00:00.000Z');
  });

  it('moves an order closed after the Tuesday cutoff to the following week', () => {
    const result = calculateTechnicalReportSyncAt(new Date('2026-09-09T07:00:00.000Z'), defaults);
    expect(result.toISOString()).toBe('2026-09-17T00:00:00.000Z');
  });

  it('supports a configurable cutoff and synchronization day', () => {
    const result = calculateTechnicalReportSyncAt(new Date('2026-09-11T18:00:00.000Z'), {
      cutoffWeekday: 5,
      syncTime: '08:30',
      syncWeekday: 1,
      timeZone: 'America/Hermosillo',
    });
    expect(result.toISOString()).toBe('2026-09-14T15:30:00.000Z');
  });
});

describe('TechnicalReportSyncScheduleService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the stored configuration and its next synchronization date', async () => {
    const updatedAt = new Date('2026-09-01T12:00:00.000Z');
    const stored = {
      id: 'technical-report',
      ...defaults,
      updatedAt,
    };
    const prisma = {
      technicalReportSyncSchedule: {
        findUnique: vi.fn().mockResolvedValue(stored),
      },
    };
    const service = new TechnicalReportSyncScheduleService(
      prisma as unknown as PrismaClient,
      defaults,
    );

    await expect(service.getConfig(new Date('2026-09-08T23:00:00.000Z'))).resolves.toEqual({
      ...defaults,
      nextSyncAt: new Date('2026-09-10T00:00:00.000Z'),
      updatedAt,
    });
    expect(prisma.technicalReportSyncSchedule.findUnique).toHaveBeenCalledWith({
      where: { id: 'technical-report' },
    });
  });

  it('schedules each unplanned pending technical report operation', async () => {
    const operations = [
      { id: 'op-current-week', createdAt: new Date('2026-09-08T23:00:00.000Z') },
      { id: 'op-next-week', createdAt: new Date('2026-09-09T07:00:00.000Z') },
    ];
    const prisma = {
      technicalReportSyncSchedule: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      sheetSyncOperation: {
        findMany: vi.fn().mockResolvedValue(operations),
        update: vi.fn().mockResolvedValue(undefined),
      },
    };
    const service = new TechnicalReportSyncScheduleService(
      prisma as unknown as PrismaClient,
      defaults,
    );

    await expect(service.scheduleUnplannedOperations()).resolves.toBe(2);
    expect(prisma.sheetSyncOperation.findMany).toHaveBeenCalledWith({
      where: {
        lastAttemptAt: null,
        operationType: 'SHEET_TECHNICAL_REPORT',
        scheduledFor: null,
        status: SyncStatus.PENDING,
      },
      select: { createdAt: true, id: true },
    });
    expect(prisma.sheetSyncOperation.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'op-current-week' },
      data: {
        nextAttemptAt: new Date('2026-09-10T00:00:00.000Z'),
        scheduledFor: new Date('2026-09-10T00:00:00.000Z'),
      },
    });
    expect(prisma.sheetSyncOperation.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'op-next-week' },
      data: {
        nextAttemptAt: new Date('2026-09-17T00:00:00.000Z'),
        scheduledFor: new Date('2026-09-17T00:00:00.000Z'),
      },
    });
  });

  it('saves a new configuration, reschedules pending operations, and writes an audit log', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-08T18:00:00.000Z'));
    const input = {
      cutoffWeekday: 5,
      syncTime: '08:30',
      syncWeekday: 1,
      timeZone: 'America/Hermosillo',
    };
    const updated = {
      id: 'technical-report',
      ...input,
      createdAt: new Date('2026-09-08T18:00:00.000Z'),
      updatedAt: new Date('2026-09-08T18:00:00.000Z'),
    };
    const tx = {
      technicalReportSyncSchedule: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue(updated),
      },
      sheetSyncOperation: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: 'op-to-reschedule', createdAt: new Date('2026-09-11T18:00:00.000Z') },
          ]),
        update: vi.fn().mockResolvedValue(undefined),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<void>) =>
        callback(tx),
      ),
      technicalReportSyncSchedule: {
        findUnique: vi.fn().mockResolvedValue(updated),
      },
    };
    const service = new TechnicalReportSyncScheduleService(
      prisma as unknown as PrismaClient,
      defaults,
    );

    await service.updateConfig('admin-user-id', input);

    expect(tx.technicalReportSyncSchedule.upsert).toHaveBeenCalledWith({
      where: { id: 'technical-report' },
      create: { id: 'technical-report', ...input },
      update: input,
    });
    expect(tx.sheetSyncOperation.findMany).toHaveBeenCalledWith({
      where: {
        lastAttemptAt: null,
        operationType: 'SHEET_TECHNICAL_REPORT',
        status: SyncStatus.PENDING,
      },
      select: { createdAt: true, id: true },
    });
    expect(tx.sheetSyncOperation.update).toHaveBeenCalledWith({
      where: { id: 'op-to-reschedule' },
      data: {
        nextAttemptAt: new Date('2026-09-14T15:30:00.000Z'),
        scheduledFor: new Date('2026-09-14T15:30:00.000Z'),
      },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        action: 'TECHNICAL_REPORT_SYNC_SCHEDULE_UPDATED',
        actorUserId: 'admin-user-id',
        entityId: 'technical-report',
        entityType: 'TechnicalReportSyncSchedule',
        before: defaults,
        after: updated,
      },
    });
  });
});
