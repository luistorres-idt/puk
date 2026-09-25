CREATE TABLE "DriveFolder" (
    "logicalKey" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "parentDriveFileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "DriveFolder_pkey" PRIMARY KEY ("logicalKey")
);

CREATE UNIQUE INDEX "DriveFolder_driveFileId_key" ON "DriveFolder"("driveFileId");
CREATE INDEX "DriveFolder_parentDriveFileId_idx" ON "DriveFolder"("parentDriveFileId");
