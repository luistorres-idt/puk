/* eslint-disable no-console */
import { PrismaClient } from '../apps/api/src/generated/prisma/client.js';
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';

/**
 * Cleanup Abandoned and Orphaned S3/MinIO Storage Objects
 *
 * Identifies:
 * 1. PENDING upload records in the database older than 24 hours (abandoned uploads).
 * 2. Storage objects in bucket without a corresponding active database record.
 */

async function main() {
  const prisma = new PrismaClient();
  const bucketName = process.env.OBJECT_STORAGE_BUCKET ?? 'service-orders';

  const s3 = new S3Client({
    region: process.env.OBJECT_STORAGE_REGION ?? 'us-east-1',
    endpoint: process.env.OBJECT_STORAGE_ENDPOINT,
    credentials: {
      accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY ?? 'minioadmin',
      secretAccessKey: process.env.OBJECT_STORAGE_SECRET_KEY ?? 'minioadmin',
    },
    forcePathStyle: true,
  });

  console.log(`Starting orphaned objects cleanup on bucket: ${bucketName}...`);

  // Step 1: Clean up pending uploads older than 24 hours
  const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const abandonedEvidences = await prisma.evidence.findMany({
    where: {
      status: 'PENDING',
      createdAt: { lt: threshold },
    },
  });

  console.log(`Found ${abandonedEvidences.length} abandoned pending evidence records.`);
  for (const evidence of abandonedEvidences) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: evidence.objectKey }));
    } catch {
      // Ignore if not present in S3
    }
    await prisma.evidence.delete({ where: { id: evidence.id } });
  }

  // Step 2: Query active object keys from DB
  const activeEvidences = await prisma.evidence.findMany({ select: { objectKey: true } });
  const activeSignatures = await prisma.signature.findMany({ select: { objectKey: true } });
  const activeKeys = new Set([
    ...activeEvidences.map((e) => e.objectKey),
    ...activeSignatures.map((s) => s.objectKey),
  ]);

  // Step 3: Scan bucket
  let isTruncated = true;
  let continuationToken: string | undefined;
  let deletedOrphansCount = 0;

  while (isTruncated) {
    const listRes = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        ContinuationToken: continuationToken,
      }),
    );

    if (listRes.Contents) {
      for (const object of listRes.Contents) {
        if (object.Key && !activeKeys.has(object.Key)) {
          // Object in bucket has no DB reference and is older than 2 hours
          const lastModified = object.LastModified ?? new Date();
          const ageHours = (Date.now() - lastModified.getTime()) / (1000 * 60 * 60);
          if (ageHours > 2) {
            console.log(
              `Removing orphan storage object: ${object.Key} (age: ${ageHours.toFixed(1)}h)`,
            );
            await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: object.Key }));
            deletedOrphansCount++;
          }
        }
      }
    }

    isTruncated = listRes.IsTruncated ?? false;
    continuationToken = listRes.NextContinuationToken;
  }

  console.log(`Cleanup completed. Deleted ${deletedOrphansCount} orphaned objects.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Error during cleanup:', err);
  process.exit(1);
});
