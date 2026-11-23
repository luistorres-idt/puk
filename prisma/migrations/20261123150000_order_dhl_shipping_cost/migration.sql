-- Add optional DHL shipping cost for in-app technical report settlement.
ALTER TABLE "Order"
    ADD COLUMN "dhlShippingCost" DECIMAL(10, 2);
