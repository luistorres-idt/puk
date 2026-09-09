-- AlterTable
ALTER TABLE "Order" ADD COLUMN "pricingBreakdown" JSONB;

-- AlterTable
ALTER TABLE "OrderUnit" ADD COLUMN     "serviceType" "OrderServiceType" NOT NULL DEFAULT 'INSTALLATION';

-- Backfill OrderUnit.serviceType from parent Order.serviceType
UPDATE "OrderUnit" u
SET "serviceType" = o."serviceType"
FROM "Order" o
WHERE u."orderId" = o."id"
  AND o."serviceType" IS NOT NULL;

-- CreateIndex
CREATE INDEX "OrderUnit_orderId_serviceType_idx" ON "OrderUnit"("orderId", "serviceType");
