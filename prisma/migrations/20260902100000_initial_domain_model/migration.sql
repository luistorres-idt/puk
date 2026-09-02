-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'TECHNICIAN');

-- CreateEnum
CREATE TYPE "OrderServiceType" AS ENUM ('INSTALLATION', 'REVIEW', 'UNINSTALLATION', 'FAILED_APPOINTMENT');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'ASSIGNED', 'IN_PROGRESS', 'REQUIRES_CORRECTION', 'COMPLETED', 'FAILED_APPOINTMENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UnitStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ChecklistCategory" AS ENUM ('DASHBOARD', 'WINDOWS', 'ACCESSORIES', 'TRIMS', 'BODYWORK');

-- CreateEnum
CREATE TYPE "ChecklistCondition" AS ENUM ('GOOD', 'BAD', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "EquipmentVerificationStatus" AS ENUM ('PENDING', 'MATCHED', 'DISCREPANCY_REPORTED');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('PENDING', 'COMPLETED', 'REJECTED', 'DELETED');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'PROCESSING', 'SYNCED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "technicianId" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Technician" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "workshop" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Technician_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "folio" TEXT NOT NULL,
    "serviceType" "OrderServiceType" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "clientSheetId" TEXT NOT NULL,
    "clientNameSnapshot" TEXT NOT NULL,
    "technicianId" UUID,
    "scheduledAt" TIMESTAMPTZ(3) NOT NULL,
    "isHomeService" BOOLEAN NOT NULL DEFAULT false,
    "serviceAddress" TEXT,
    "generalNotes" TEXT,
    "failedReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderUnit" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "makeModel" TEXT NOT NULL,
    "year" INTEGER,
    "serialNumber" TEXT NOT NULL,
    "status" "UnitStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrderUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEquipment" (
    "id" UUID NOT NULL,
    "orderUnitId" UUID NOT NULL,
    "sheetName" TEXT NOT NULL DEFAULT 'SALIDAS',
    "sheetRowHint" INTEGER,
    "externalId" TEXT,
    "imei" TEXT,
    "externalKey" TEXT NOT NULL,
    "activeAssignment" BOOLEAN NOT NULL DEFAULT false,
    "brandSnapshot" TEXT,
    "modelSnapshot" TEXT,
    "lineSnapshot" TEXT,
    "iccidSnapshot" TEXT,
    "carrierSnapshot" TEXT,
    "equipmentConditionSnapshot" TEXT,
    "serviceStatusSnapshot" TEXT,
    "rawSnapshot" JSONB NOT NULL,
    "verificationStatus" "EquipmentVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMPTZ(3),
    "verifiedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrderEquipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Checklist" (
    "id" UUID NOT NULL,
    "orderUnitId" UUID NOT NULL,
    "completedById" UUID,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Checklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" UUID NOT NULL,
    "checklistId" UUID NOT NULL,
    "category" "ChecklistCategory" NOT NULL,
    "condition" "ChecklistCondition",
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" UUID NOT NULL,
    "checklistItemId" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "status" "UploadStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signature" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "signerName" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "signedAt" TIMESTAMPTZ(3) NOT NULL,
    "capturedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Discrepancy" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "orderUnitId" UUID NOT NULL,
    "orderEquipmentId" UUID,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "expectedSnapshot" JSONB NOT NULL,
    "observedSnapshot" JSONB NOT NULL,
    "reportedById" UUID NOT NULL,
    "reportedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),
    "resolvedById" UUID,
    "resolutionNotes" TEXT,

    CONSTRAINT "Discrepancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "jti" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" INET,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "replacedByJti" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "requestId" TEXT,
    "ipAddress" INET,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SheetSyncOperation" (
    "id" UUID NOT NULL,
    "orderId" UUID,
    "operationType" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "nextAttemptAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "syncedAt" TIMESTAMPTZ(3),

    CONSTRAINT "SheetSyncOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_technicianId_key" ON "User"("technicianId");

-- CreateIndex
CREATE INDEX "User_role_active_idx" ON "User"("role", "active");

-- CreateIndex
CREATE INDEX "Technician_active_name_idx" ON "Technician"("active", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Order_folio_key" ON "Order"("folio");

-- CreateIndex
CREATE INDEX "Order_technicianId_status_scheduledAt_idx" ON "Order"("technicianId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Order_clientSheetId_createdAt_idx" ON "Order"("clientSheetId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_status_scheduledAt_idx" ON "Order"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "OrderUnit_orderId_status_idx" ON "OrderUnit"("orderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OrderUnit_orderId_serialNumber_key" ON "OrderUnit"("orderId", "serialNumber");

-- CreateIndex
CREATE INDEX "OrderEquipment_externalKey_idx" ON "OrderEquipment"("externalKey");

-- CreateIndex
CREATE INDEX "OrderEquipment_verifiedById_idx" ON "OrderEquipment"("verifiedById");

-- CreateIndex
CREATE UNIQUE INDEX "OrderEquipment_orderUnitId_externalKey_key" ON "OrderEquipment"("orderUnitId", "externalKey");

-- CreateIndex
CREATE UNIQUE INDEX "Checklist_orderUnitId_key" ON "Checklist"("orderUnitId");

-- CreateIndex
CREATE INDEX "Checklist_completedById_idx" ON "Checklist"("completedById");

-- CreateIndex
CREATE INDEX "ChecklistItem_checklistId_idx" ON "ChecklistItem"("checklistId");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistItem_checklistId_category_key" ON "ChecklistItem"("checklistId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "Evidence_objectKey_key" ON "Evidence"("objectKey");

-- CreateIndex
CREATE INDEX "Evidence_checklistItemId_status_idx" ON "Evidence"("checklistItemId", "status");

-- CreateIndex
CREATE INDEX "Evidence_uploadedById_idx" ON "Evidence"("uploadedById");

-- CreateIndex
CREATE INDEX "Evidence_status_createdAt_idx" ON "Evidence"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Signature_orderId_key" ON "Signature"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Signature_objectKey_key" ON "Signature"("objectKey");

-- CreateIndex
CREATE INDEX "Signature_capturedById_idx" ON "Signature"("capturedById");

-- CreateIndex
CREATE INDEX "Discrepancy_orderId_resolvedAt_idx" ON "Discrepancy"("orderId", "resolvedAt");

-- CreateIndex
CREATE INDEX "Discrepancy_orderUnitId_idx" ON "Discrepancy"("orderUnitId");

-- CreateIndex
CREATE INDEX "Discrepancy_orderEquipmentId_idx" ON "Discrepancy"("orderEquipmentId");

-- CreateIndex
CREATE INDEX "Discrepancy_reportedById_idx" ON "Discrepancy"("reportedById");

-- CreateIndex
CREATE INDEX "Discrepancy_resolvedById_idx" ON "Discrepancy"("resolvedById");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshSession_jti_key" ON "RefreshSession"("jti");

-- CreateIndex
CREATE INDEX "RefreshSession_userId_expiresAt_idx" ON "RefreshSession"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "RefreshSession_expiresAt_idx" ON "RefreshSession"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_requestId_idx" ON "AuditLog"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "SheetSyncOperation_idempotencyKey_key" ON "SheetSyncOperation"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SheetSyncOperation_orderId_status_idx" ON "SheetSyncOperation"("orderId", "status");

-- CreateIndex
CREATE INDEX "SheetSyncOperation_status_nextAttemptAt_createdAt_idx" ON "SheetSyncOperation"("status", "nextAttemptAt", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderUnit" ADD CONSTRAINT "OrderUnit_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEquipment" ADD CONSTRAINT "OrderEquipment_orderUnitId_fkey" FOREIGN KEY ("orderUnitId") REFERENCES "OrderUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEquipment" ADD CONSTRAINT "OrderEquipment_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checklist" ADD CONSTRAINT "Checklist_orderUnitId_fkey" FOREIGN KEY ("orderUnitId") REFERENCES "OrderUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checklist" ADD CONSTRAINT "Checklist_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "Checklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "ChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_capturedById_fkey" FOREIGN KEY ("capturedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discrepancy" ADD CONSTRAINT "Discrepancy_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discrepancy" ADD CONSTRAINT "Discrepancy_orderUnitId_fkey" FOREIGN KEY ("orderUnitId") REFERENCES "OrderUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discrepancy" ADD CONSTRAINT "Discrepancy_orderEquipmentId_fkey" FOREIGN KEY ("orderEquipmentId") REFERENCES "OrderEquipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discrepancy" ADD CONSTRAINT "Discrepancy_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discrepancy" ADD CONSTRAINT "Discrepancy_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SheetSyncOperation" ADD CONSTRAINT "SheetSyncOperation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Domain constraints not expressible in Prisma's schema language.
ALTER TABLE "Order" ADD CONSTRAINT "Order_version_positive" CHECK ("version" > 0);
ALTER TABLE "OrderUnit" ADD CONSTRAINT "OrderUnit_year_valid" CHECK ("year" IS NULL OR "year" BETWEEN 1886 AND 2200);
ALTER TABLE "OrderEquipment" ADD CONSTRAINT "OrderEquipment_sheetRowHint_positive" CHECK ("sheetRowHint" IS NULL OR "sheetRowHint" > 0);
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_dimensions_positive" CHECK (
  "sizeBytes" > 0
  AND ("width" IS NULL OR "width" > 0)
  AND ("height" IS NULL OR "height" > 0)
);
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_sizeBytes_positive" CHECK ("sizeBytes" > 0);
ALTER TABLE "SheetSyncOperation" ADD CONSTRAINT "SheetSyncOperation_attempts_nonnegative" CHECK ("attempts" >= 0);

-- Enforced across every active order assignment; terminal/draft services set activeAssignment=false.
CREATE UNIQUE INDEX "OrderEquipment_active_externalKey_key"
ON "OrderEquipment" ("externalKey")
WHERE "activeAssignment" = true;
