import type { UpdateTechnicalReportSyncSchedule } from '@puk/contracts';

import type { PrismaClient } from '../../generated/prisma/client.js';
import { Prisma, SyncStatus } from '../../generated/prisma/client.js';
import { AppError } from '../../shared/errors.js';

const SCHEDULE_ID = 'technical-report';

export interface TechnicalReportSyncScheduleConfig {
  cutoffWeekday: number;
  syncTime: string;
  syncWeekday: number;
  timeZone: string;
}

interface LocalDateTimeParts {
  day: number;
  hour: number;
  millisecond: number;
  minute: number;
  month: number;
  second: number;
  weekday: number;
  year: number;
}

const WEEKDAY_BY_NAME: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function assertValidTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
  } catch {
    throw new AppError(400, 'INVALID_TIME_ZONE', 'La zona horaria no es válida');
  }
}

function zonedParts(date: Date, timeZone: string): LocalDateTimeParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone,
    weekday: 'short',
    year: 'numeric',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return {
    day: Number(value('day')),
    hour: Number(value('hour')),
    millisecond: date.getUTCMilliseconds(),
    minute: Number(value('minute')),
    month: Number(value('month')),
    second: Number(value('second')),
    weekday: WEEKDAY_BY_NAME[value('weekday')] ?? 0,
    year: Number(value('year')),
  };
}

function addCalendarDays(date: Pick<LocalDateTimeParts, 'year' | 'month' | 'day'>, days: number) {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    day: shifted.getUTCDate(),
    month: shifted.getUTCMonth() + 1,
    year: shifted.getUTCFullYear(),
  };
}

function localDateTimeToUtc(local: Omit<LocalDateTimeParts, 'weekday'>, timeZone: string): Date {
  const desiredAsUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
    local.millisecond,
  );
  let candidate = desiredAsUtc;

  for (let attempt = 0; attempt < 3; attempt++) {
    const actual = zonedParts(new Date(candidate), timeZone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
      actual.millisecond,
    );
    const adjustment = desiredAsUtc - actualAsUtc;
    candidate += adjustment;
    if (adjustment === 0) break;
  }

  return new Date(candidate);
}

export function calculateTechnicalReportSyncAt(
  reference: Date,
  config: TechnicalReportSyncScheduleConfig,
): Date {
  assertValidTimeZone(config.timeZone);
  const localReference = zonedParts(reference, config.timeZone);
  let cutoffDate = addCalendarDays(localReference, config.cutoffWeekday - localReference.weekday);
  let cutoffAt = localDateTimeToUtc(
    { ...cutoffDate, hour: 23, minute: 59, second: 59, millisecond: 999 },
    config.timeZone,
  );

  if (reference.getTime() > cutoffAt.getTime()) {
    cutoffDate = addCalendarDays(cutoffDate, 7);
    cutoffAt = localDateTimeToUtc(
      { ...cutoffDate, hour: 23, minute: 59, second: 59, millisecond: 999 },
      config.timeZone,
    );
  }

  let daysAfterCutoff = (config.syncWeekday - config.cutoffWeekday + 7) % 7;
  if (daysAfterCutoff === 0) daysAfterCutoff = 7;
  const syncDate = addCalendarDays(cutoffDate, daysAfterCutoff);
  const [hour, minute] = config.syncTime.split(':').map(Number) as [number, number];
  const scheduledAt = localDateTimeToUtc(
    { ...syncDate, hour, minute, second: 0, millisecond: 0 },
    config.timeZone,
  );

  if (scheduledAt.getTime() <= cutoffAt.getTime()) {
    throw new AppError(
      400,
      'INVALID_SYNC_SCHEDULE',
      'La sincronización debe ocurrir después del corte',
    );
  }
  return scheduledAt;
}

export class TechnicalReportSyncScheduleService {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly defaults: TechnicalReportSyncScheduleConfig,
  ) {}

  public async getConfig(reference = new Date()) {
    const stored = await this.prisma.technicalReportSyncSchedule.findUnique({
      where: { id: SCHEDULE_ID },
    });
    const config: TechnicalReportSyncScheduleConfig = stored
      ? {
          cutoffWeekday: stored.cutoffWeekday,
          syncTime: stored.syncTime,
          syncWeekday: stored.syncWeekday,
          timeZone: stored.timeZone,
        }
      : this.defaults;
    assertValidTimeZone(config.timeZone);
    return {
      ...config,
      nextSyncAt: calculateTechnicalReportSyncAt(reference, config),
      updatedAt: stored?.updatedAt ?? null,
    };
  }

  public async getNextScheduledAt(reference = new Date()): Promise<Date> {
    const config = await this.getConfig(reference);
    return calculateTechnicalReportSyncAt(reference, config);
  }

  public async scheduleUnplannedOperations(): Promise<number> {
    const config = await this.getConfig();
    const pending = await this.prisma.sheetSyncOperation.findMany({
      where: {
        lastAttemptAt: null,
        operationType: 'SHEET_TECHNICAL_REPORT',
        scheduledFor: null,
        status: SyncStatus.PENDING,
      },
      select: { createdAt: true, id: true },
    });
    for (const operation of pending) {
      const scheduledFor = calculateTechnicalReportSyncAt(operation.createdAt, config);
      await this.prisma.sheetSyncOperation.update({
        where: { id: operation.id },
        data: { nextAttemptAt: scheduledFor, scheduledFor },
      });
    }
    return pending.length;
  }

  public async updateConfig(actorUserId: string, input: UpdateTechnicalReportSyncSchedule) {
    assertValidTimeZone(input.timeZone);
    calculateTechnicalReportSyncAt(new Date(), input);

    await this.prisma.$transaction(async (tx) => {
      const before = await tx.technicalReportSyncSchedule.findUnique({
        where: { id: SCHEDULE_ID },
      });
      const updated = await tx.technicalReportSyncSchedule.upsert({
        where: { id: SCHEDULE_ID },
        create: { id: SCHEDULE_ID, ...input },
        update: input,
      });
      const pending = await tx.sheetSyncOperation.findMany({
        where: {
          lastAttemptAt: null,
          operationType: 'SHEET_TECHNICAL_REPORT',
          status: SyncStatus.PENDING,
        },
        select: { createdAt: true, id: true },
      });
      for (const operation of pending) {
        const scheduledFor = calculateTechnicalReportSyncAt(operation.createdAt, input);
        await tx.sheetSyncOperation.update({
          where: { id: operation.id },
          data: { nextAttemptAt: scheduledFor, scheduledFor },
        });
      }
      await tx.auditLog.create({
        data: {
          action: 'TECHNICAL_REPORT_SYNC_SCHEDULE_UPDATED',
          actorUserId,
          entityId: SCHEDULE_ID,
          entityType: 'TechnicalReportSyncSchedule',
          before: (before ?? this.defaults) as unknown as Prisma.InputJsonValue,
          after: updated as unknown as Prisma.InputJsonValue,
        },
      });
    });

    return this.getConfig();
  }
}
