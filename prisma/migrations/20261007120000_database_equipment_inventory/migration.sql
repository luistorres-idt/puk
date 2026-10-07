CREATE TYPE "EquipmentSource" AS ENUM ('SHEETS', 'DB');
CREATE TYPE "InventoryEquipmentState" AS ENUM ('AVAILABLE', 'INSTALLED');
CREATE TABLE "Equipment" (
  "id" UUID NOT NULL,
  "imei" TEXT NOT NULL,
  "brand" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "state" "InventoryEquipmentState" NOT NULL,
  "currentClientSheetId" TEXT,
  "currentClientName" TEXT,
  "unitLabel" TEXT,
  "unitMakeModel" TEXT,
  "unitSerialNumber" TEXT,
  "unitYear" INTEGER,
  "registrationKey" UUID NOT NULL,
  "registrationHash" TEXT NOT NULL,
  "createdById" UUID NOT NULL,
  "reservedOrderId" UUID,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Equipment_imei_format" CHECK ("imei" ~ '^[0-9]{15}$'),
  CONSTRAINT "Equipment_required_fields" CHECK (length(btrim("brand")) > 0 AND length(btrim("model")) > 0),
  CONSTRAINT "Equipment_installed_context" CHECK ("state" <> 'INSTALLED' OR (
    length(btrim(coalesce("currentClientSheetId", ''))) > 0 AND
    length(btrim(coalesce("currentClientName", ''))) > 0 AND
    length(btrim(coalesce("unitLabel", ''))) > 0 AND
    length(btrim(coalesce("unitMakeModel", ''))) > 0 AND
    length(btrim(coalesce("unitSerialNumber", ''))) > 0
  )),
  CONSTRAINT "Equipment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Equipment_reservedOrderId_fkey" FOREIGN KEY ("reservedOrderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Equipment_imei_key" ON "Equipment"("imei");
CREATE UNIQUE INDEX "Equipment_registrationKey_key" ON "Equipment"("registrationKey");
CREATE INDEX "Equipment_state_currentClientSheetId_idx" ON "Equipment"("state", "currentClientSheetId");
CREATE INDEX "Equipment_reservedOrderId_idx" ON "Equipment"("reservedOrderId");
ALTER TABLE "OrderEquipment" ADD COLUMN "source" "EquipmentSource" NOT NULL DEFAULT 'SHEETS', ADD COLUMN "inventoryEquipmentId" UUID;
ALTER TABLE "OrderEquipment" ADD CONSTRAINT "OrderEquipment_inventoryEquipmentId_fkey" FOREIGN KEY ("inventoryEquipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderEquipment" ADD CONSTRAINT "OrderEquipment_source_reference" CHECK (("source" = 'DB') = ("inventoryEquipmentId" IS NOT NULL));
