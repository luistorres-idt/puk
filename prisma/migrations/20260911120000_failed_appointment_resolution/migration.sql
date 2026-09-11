CREATE TYPE "FailedAppointmentResolution" AS ENUM ('CANCELLED', 'RESCHEDULED');

ALTER TABLE "Order"
ADD COLUMN "failedAppointmentResolution" "FailedAppointmentResolution",
ADD COLUMN "failedAppointmentResolvedAt" TIMESTAMPTZ(3),
ADD COLUMN "failedAppointmentResolvedById" UUID,
ADD COLUMN "failedAppointmentResolutionReason" TEXT,
ADD COLUMN "rescheduledFromOrderId" UUID;

CREATE UNIQUE INDEX "Order_rescheduledFromOrderId_key"
ON "Order"("rescheduledFromOrderId");

CREATE INDEX "Order_status_failedAppointmentResolution_idx"
ON "Order"("status", "failedAppointmentResolution");

CREATE INDEX "Order_failedAppointmentResolvedById_idx"
ON "Order"("failedAppointmentResolvedById");

ALTER TABLE "Order"
ADD CONSTRAINT "Order_failedAppointmentResolvedById_fkey"
FOREIGN KEY ("failedAppointmentResolvedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Order"
ADD CONSTRAINT "Order_rescheduledFromOrderId_fkey"
FOREIGN KEY ("rescheduledFromOrderId") REFERENCES "Order"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Order"
ADD CONSTRAINT "Order_failed_appointment_resolution_status_check"
CHECK (
  "failedAppointmentResolution" IS NULL
  OR "status" = 'FAILED_APPOINTMENT'
);
