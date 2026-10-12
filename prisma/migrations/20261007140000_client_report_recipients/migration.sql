-- Persist recipients separately from the existing Sheets catalog and order snapshots.
CREATE TABLE "Client" (
    "id" UUID NOT NULL,
    "clientSheetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ClientEmail" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ClientEmail_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Client_clientSheetId_key" ON "Client"("clientSheetId");
CREATE INDEX "Client_name_idx" ON "Client"("name");
CREATE UNIQUE INDEX "ClientEmail_clientId_email_key" ON "ClientEmail"("clientId", "email");
ALTER TABLE "ClientEmail" ADD CONSTRAINT "ClientEmail_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
