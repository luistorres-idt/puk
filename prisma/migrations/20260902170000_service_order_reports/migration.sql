CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

CREATE TABLE "ServiceOrderReport" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "objectKey" TEXT,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "sizeBytes" INTEGER,
    "checksum" TEXT,
    "failureReason" TEXT,
    "generatedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ServiceOrderReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceOrderReport_objectKey_key" ON "ServiceOrderReport"("objectKey");
CREATE UNIQUE INDEX "ServiceOrderReport_orderId_version_key" ON "ServiceOrderReport"("orderId", "version");
CREATE INDEX "ServiceOrderReport_orderId_status_createdAt_idx" ON "ServiceOrderReport"("orderId", "status", "createdAt");
CREATE INDEX "ServiceOrderReport_status_createdAt_idx" ON "ServiceOrderReport"("status", "createdAt");

ALTER TABLE "ServiceOrderReport"
ADD CONSTRAINT "ServiceOrderReport_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
