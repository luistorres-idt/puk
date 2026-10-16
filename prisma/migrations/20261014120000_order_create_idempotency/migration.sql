-- Persist request identity on the created order so retries survive API restarts.
ALTER TABLE "Order"
    ADD COLUMN "creationIdempotencyKey" UUID,
    ADD COLUMN "creationRequestHash" CHAR(64),
    ADD CONSTRAINT "Order_creation_idempotency_fields_check"
        CHECK (("creationIdempotencyKey" IS NULL) = ("creationRequestHash" IS NULL));

CREATE UNIQUE INDEX "Order_createdById_creationIdempotencyKey_key"
    ON "Order"("createdById", "creationIdempotencyKey");
