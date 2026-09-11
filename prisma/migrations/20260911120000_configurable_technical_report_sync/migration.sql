ALTER TYPE "SyncStatus" ADD VALUE 'SUPERSEDED';

ALTER TABLE "SheetSyncOperation"
ADD COLUMN "scheduledFor" TIMESTAMPTZ(3),
ADD COLUMN "lastAttemptAt" TIMESTAMPTZ(3);

CREATE INDEX "SheetSyncOperation_operationType_status_scheduledFor_idx"
ON "SheetSyncOperation"("operationType", "status", "scheduledFor");

CREATE TABLE "TechnicalReportSyncSchedule" (
    "id" TEXT NOT NULL,
    "syncWeekday" INTEGER NOT NULL DEFAULT 3,
    "syncTime" TEXT NOT NULL DEFAULT '17:00',
    "cutoffWeekday" INTEGER NOT NULL DEFAULT 2,
    "timeZone" TEXT NOT NULL DEFAULT 'America/Hermosillo',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "TechnicalReportSyncSchedule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TechnicalReportSyncSchedule_syncWeekday_check" CHECK ("syncWeekday" BETWEEN 0 AND 6),
    CONSTRAINT "TechnicalReportSyncSchedule_cutoffWeekday_check" CHECK ("cutoffWeekday" BETWEEN 0 AND 6),
    CONSTRAINT "TechnicalReportSyncSchedule_syncTime_check" CHECK ("syncTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
