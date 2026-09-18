ALTER TABLE "AuditLog"
ADD COLUMN "context" JSONB;

CREATE TABLE "SharedTechnicianAccess" (
    "id" INTEGER NOT NULL,
    "userId" UUID,
    "orderId" UUID,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SharedTechnicianAccess_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SharedTechnicianAccess_id_check" CHECK ("id" = 1),
    CONSTRAINT "SharedTechnicianAccess_revision_check" CHECK ("revision" >= 0),
    CONSTRAINT "SharedTechnicianAccess_order_requires_user_check" CHECK ("orderId" IS NULL OR "userId" IS NOT NULL)
);

CREATE UNIQUE INDEX "SharedTechnicianAccess_userId_key" ON "SharedTechnicianAccess"("userId");
CREATE UNIQUE INDEX "SharedTechnicianAccess_orderId_key" ON "SharedTechnicianAccess"("orderId");
CREATE INDEX "SharedTechnicianAccess_userId_orderId_idx" ON "SharedTechnicianAccess"("userId", "orderId");

ALTER TABLE "SharedTechnicianAccess"
ADD CONSTRAINT "SharedTechnicianAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SharedTechnicianAccess"
ADD CONSTRAINT "SharedTechnicianAccess_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "SharedTechnicianAccess" ("id", "revision", "updatedAt")
VALUES (1, 0, CURRENT_TIMESTAMP);
