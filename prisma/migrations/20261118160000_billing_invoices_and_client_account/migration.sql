-- Add BILLING role and billing/invoicing domain models with extended client account metadata.
ALTER TYPE "UserRole" ADD VALUE 'BILLING';

CREATE TYPE "ClientAccountStatus" AS ENUM (
    'ACTIVE',
    'SUSPENDED',
    'PAYMENT_PROMISE',
    'PAYMENT_IN_PROGRESS'
);

CREATE TYPE "InvoiceType" AS ENUM (
    'MONTHLY',
    'TECHNICAL_SERVICE'
);

CREATE TYPE "InvoicePaymentStatus" AS ENUM (
    'UNPAID',
    'PAID'
);

ALTER TABLE "Client"
    ADD COLUMN "legalName" TEXT,
    ADD COLUMN "platformClient" TEXT,
    ADD COLUMN "contactPhone" TEXT,
    ADD COLUMN "accountStatus" "ClientAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN "suspendedAt" TIMESTAMPTZ(3),
    ADD COLUMN "paymentPromiseDate" TIMESTAMPTZ(3);

CREATE INDEX "Client_accountStatus_idx" ON "Client"("accountStatus");

CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "folio" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "invoiceType" "InvoiceType",
    "paymentStatus" "InvoicePaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "totalAmount" DECIMAL(12, 2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "issuedAt" TIMESTAMPTZ(3) NOT NULL,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "paidAt" TIMESTAMPTZ(3),
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoicePayment" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "amount" DECIMAL(12, 2) NOT NULL,
    "paidAt" TIMESTAMPTZ(3) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "recordedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoicePayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invoice_folio_key" ON "Invoice"("folio");
CREATE INDEX "Invoice_clientId_paymentStatus_deletedAt_idx" ON "Invoice"("clientId", "paymentStatus", "deletedAt");
CREATE INDEX "Invoice_paymentStatus_dueAt_idx" ON "Invoice"("paymentStatus", "dueAt");
CREATE INDEX "Invoice_issuedAt_idx" ON "Invoice"("issuedAt");
CREATE INDEX "Invoice_deletedAt_idx" ON "Invoice"("deletedAt");

CREATE INDEX "InvoicePayment_invoiceId_paidAt_idx" ON "InvoicePayment"("invoiceId", "paidAt");
CREATE INDEX "InvoicePayment_recordedById_idx" ON "InvoicePayment"("recordedById");

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_recordedById_fkey"
    FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
