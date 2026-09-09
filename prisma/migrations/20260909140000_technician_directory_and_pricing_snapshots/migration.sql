-- AlterTable Technician
ALTER TABLE "Technician" ADD COLUMN "externalKey" TEXT;
ALTER TABLE "Technician" ADD COLUMN "legalName" TEXT;
ALTER TABLE "Technician" ADD COLUMN "email" TEXT;
ALTER TABLE "Technician" ADD COLUMN "invoice" TEXT;
ALTER TABLE "Technician" ADD COLUMN "taxData" TEXT;
ALTER TABLE "Technician" ADD COLUMN "taxAddress" TEXT;
ALTER TABLE "Technician" ADD COLUMN "departureCost" DECIMAL(10,2);
ALTER TABLE "Technician" ADD COLUMN "replacementRate" DECIMAL(10,2);
ALTER TABLE "Technician" ADD COLUMN "installationRate" DECIMAL(10,2);
ALTER TABLE "Technician" ADD COLUMN "reviewRate" DECIMAL(10,2);
ALTER TABLE "Technician" ADD COLUMN "uninstallationRate" DECIMAL(10,2);
ALTER TABLE "Technician" ADD COLUMN "failedAppointmentRate" DECIMAL(10,2);
ALTER TABLE "Technician" ADD COLUMN "fuelSensorRate" DECIMAL(10,2);
ALTER TABLE "Technician" ADD COLUMN "notes" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Technician_externalKey_key" ON "Technician"("externalKey");
CREATE INDEX "Technician_externalKey_idx" ON "Technician"("externalKey");

-- AlterTable Order
ALTER TABLE "Order" ADD COLUMN "technicianNameSnapshot" TEXT;
ALTER TABLE "Order" ADD COLUMN "technicianExternalKeySnapshot" TEXT;
ALTER TABLE "Order" ADD COLUMN "pricingUnitRate" DECIMAL(10,2);
ALTER TABLE "Order" ADD COLUMN "pricingAppliedQuantity" INTEGER;
ALTER TABLE "Order" ADD COLUMN "pricingBaseCost" DECIMAL(10,2);
ALTER TABLE "Order" ADD COLUMN "pricingDepartureCost" DECIMAL(10,2);
ALTER TABLE "Order" ADD COLUMN "pricingTravelExpenses" DECIMAL(10,2);
ALTER TABLE "Order" ADD COLUMN "pricingTotal" DECIMAL(10,2);
ALTER TABLE "Order" ADD COLUMN "pricingCurrency" TEXT DEFAULT 'MXN';
ALTER TABLE "Order" ADD COLUMN "pricingSnapshotAt" TIMESTAMPTZ(3);
ALTER TABLE "Order" ADD COLUMN "pricingVersion" INTEGER DEFAULT 1;
ALTER TABLE "Order" ADD COLUMN "correctionReason" TEXT;
