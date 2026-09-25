import { createHash } from 'node:crypto';

import type { PrismaClient } from '../../generated/prisma/client.js';
import type { DriveFolderResolver } from '../../integrations/google-drive/drive-folder-resolver.js';
import type { GoogleDriveClient } from '../../integrations/google-drive/google-drive.client.js';
import type { ObjectStoragePort } from '../../integrations/ports.js';
import type { ReportGeneratorPort, ReportOrder } from './report-generator.js';

export interface ReportDrivePort {
  client: Pick<GoogleDriveClient, 'generateId' | 'headFile' | 'uploadFile' | 'getFile'>;
  folders: Pick<DriveFolderResolver, 'ensureSharedOrderFolder'>;
}

interface ReportIdentity {
  id: string;
  version: number;
  objectKey: string | null;
}

interface ReportStorageOrder extends ReportOrder {
  id: string;
  clientSheetId: string;
}

interface StoreReportPdfOptions {
  prisma: Pick<PrismaClient, 'serviceOrderReport'>;
  storage: Pick<ObjectStoragePort, 'putObject'>;
  generator: ReportGeneratorPort;
  drive: ReportDrivePort | undefined;
  order: ReportStorageOrder;
  report: ReportIdentity;
}

interface StoredReportPdf {
  objectKey: string;
  sizeBytes: number;
  checksum: string;
}

export async function storeReportPdf({
  prisma,
  storage,
  generator,
  drive,
  order,
  report,
}: StoreReportPdfOptions): Promise<StoredReportPdf> {
  if (!drive) {
    const generated = await generator.generate(order, report.version);
    const objectKey = `orders/${order.id}/reports/${report.id}.pdf`;
    await storage.putObject(objectKey, generated.bytes, 'application/pdf');
    return {
      objectKey,
      sizeBytes: generated.bytes.byteLength,
      checksum: generated.checksum,
    };
  }

  const parentId = await drive.folders.ensureSharedOrderFolder({
    clientSheetId: order.clientSheetId,
    clientNameSnapshot: order.clientNameSnapshot,
    orderId: order.id,
    folio: order.folio,
  });
  if (!report.objectKey) {
    const reservedId = await drive.client.generateId();
    await prisma.serviceOrderReport.updateMany({
      where: { id: report.id, objectKey: null },
      data: { objectKey: reservedId },
    });
  }
  const reserved = await prisma.serviceOrderReport.findUniqueOrThrow({
    where: { id: report.id },
  });
  const objectKey = reserved.objectKey!;
  const name = `reporte-v${report.version}.pdf`;
  const existing = await drive.client.headFile(objectKey);
  let bytes: Uint8Array;
  if (existing) {
    if (
      existing.name !== name ||
      existing.parentId !== parentId ||
      existing.mimeType !== 'application/pdf'
    ) {
      throw new Error(`Google Drive report ID ${objectKey} belongs to a different file.`);
    }
    const remoteBytes = await drive.client.getFile(objectKey);
    if (!remoteBytes) throw new Error(`Google Drive report ${objectKey} disappeared during retry.`);
    bytes = remoteBytes;
  } else {
    const generated = await generator.generate(order, report.version);
    const uploaded = await drive.client.uploadFile({
      id: objectKey,
      parentId,
      name,
      body: generated.bytes,
      mimeType: 'application/pdf',
    });
    if (uploaded.reused) {
      const remoteBytes = await drive.client.getFile(objectKey);
      if (!remoteBytes)
        throw new Error(`Google Drive report ${objectKey} disappeared during retry.`);
      bytes = remoteBytes;
    } else {
      bytes = generated.bytes;
    }
  }
  return {
    objectKey,
    sizeBytes: bytes.byteLength,
    checksum: createHash('sha256').update(bytes).digest('hex'),
  };
}
