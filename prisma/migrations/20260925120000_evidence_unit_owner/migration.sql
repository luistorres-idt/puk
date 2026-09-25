-- Evidence belongs to a service unit, not to an individual checklist section.
-- Backfill from the existing relation before removing it; no evidence rows are deleted.
ALTER TABLE "Evidence" ADD COLUMN "orderUnitId" UUID;

UPDATE "Evidence" AS evidence
SET "orderUnitId" = checklist."orderUnitId"
FROM "ChecklistItem" AS item
JOIN "Checklist" AS checklist ON checklist."id" = item."checklistId"
WHERE item."id" = evidence."checklistItemId";

ALTER TABLE "Evidence" ALTER COLUMN "orderUnitId" SET NOT NULL;

DROP INDEX IF EXISTS "Evidence_checklistItemId_status_idx";
DROP INDEX IF EXISTS "Evidence_checklistItemId_idx";
ALTER TABLE "Evidence" DROP CONSTRAINT IF EXISTS "Evidence_checklistItemId_fkey";
ALTER TABLE "Evidence" DROP COLUMN "checklistItemId";

CREATE INDEX "Evidence_orderUnitId_status_idx" ON "Evidence"("orderUnitId", "status");
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_orderUnitId_fkey"
  FOREIGN KEY ("orderUnitId") REFERENCES "OrderUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
