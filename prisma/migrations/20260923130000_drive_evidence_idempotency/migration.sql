ALTER TABLE "Evidence" ADD COLUMN "idempotencyKey" UUID;
CREATE UNIQUE INDEX "Evidence_idempotencyKey_key" ON "Evidence"("idempotencyKey");

CREATE TABLE "DriveSignatureUpload" (
    "idempotencyKey" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "previousObjectKey" TEXT,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DriveSignatureUpload_pkey" PRIMARY KEY ("idempotencyKey")
);
CREATE UNIQUE INDEX "DriveSignatureUpload_objectKey_key" ON "DriveSignatureUpload"("objectKey");
CREATE INDEX "DriveSignatureUpload_orderId_createdAt_idx" ON "DriveSignatureUpload"("orderId", "createdAt");
ALTER TABLE "DriveSignatureUpload" ADD CONSTRAINT "DriveSignatureUpload_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
