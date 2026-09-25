import type { PrismaClient } from '../../generated/prisma/client.js';
import type { GoogleDriveClient } from './google-drive.client.js';

type FolderClient = Pick<GoogleDriveClient, 'generateId' | 'getFolder' | 'createFolder'>;
type FolderRecord = NonNullable<Awaited<ReturnType<PrismaClient['driveFolder']['findUnique']>>>;

export interface EvidenceFolderInput {
  clientSheetId: string;
  clientNameSnapshot: string;
  serialNumber: string;
  orderId: string;
  folio: string;
}

export interface SharedOrderFolderInput {
  clientSheetId: string;
  clientNameSnapshot: string;
  orderId: string;
  folio: string;
}

function required(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${field} must not be empty.`);
  return trimmed;
}

export function normalizeVin(serialNumber: string): string {
  return required(serialNumber.normalize('NFKC').toUpperCase(), 'serialNumber');
}

function isUniqueConstraint(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

function logicalKey(...parts: string[]): string {
  return JSON.stringify(parts);
}

/**
 * Resolves logical folders through a unique DB mapping. A Drive ID is reserved in the DB before
 * remote creation; subsequent callers and retries use that same ID instead of creating by name.
 */
export class DriveFolderResolver {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly drive: FolderClient,
    private readonly sharedDriveId: string,
  ) {
    required(sharedDriveId, 'sharedDriveId');
  }

  public async ensureEvidenceFolder(input: EvidenceFolderInput): Promise<string> {
    const clientKey = required(input.clientSheetId, 'clientSheetId');
    const clientName = required(input.clientNameSnapshot, 'clientNameSnapshot');
    const vin = normalizeVin(input.serialNumber);
    const orderId = required(input.orderId, 'orderId');
    const folio = required(input.folio, 'folio');

    const clientId = await this.ensureFolder(
      logicalKey('client', clientKey),
      this.sharedDriveId,
      clientName,
    );
    const unitId = await this.ensureFolder(logicalKey('unit', clientKey, vin), clientId, vin);
    return this.ensureFolder(logicalKey('evidence-order', clientKey, orderId, vin), unitId, folio);
  }

  public async ensureSharedOrderFolder(input: SharedOrderFolderInput): Promise<string> {
    const clientKey = required(input.clientSheetId, 'clientSheetId');
    const clientName = required(input.clientNameSnapshot, 'clientNameSnapshot');
    const orderId = required(input.orderId, 'orderId');
    const folio = required(input.folio, 'folio');

    const clientId = await this.ensureFolder(
      logicalKey('client', clientKey),
      this.sharedDriveId,
      clientName,
    );
    const ordersId = await this.ensureFolder(
      logicalKey('shared-orders', clientKey),
      clientId,
      'Órdenes',
    );
    return this.ensureFolder(logicalKey('shared-order', clientKey, orderId), ordersId, folio);
  }

  private async ensureFolder(key: string, parentId: string, name: string): Promise<string> {
    const existing = await this.prisma.driveFolder.findUnique({ where: { logicalKey: key } });
    if (existing) return this.ensureRemoteFolder(existing, parentId);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const id = await this.drive.generateId();
      try {
        const reserved = await this.prisma.driveFolder.create({
          data: {
            logicalKey: key,
            driveFileId: id,
            parentDriveFileId: parentId,
            name,
          },
        });
        return this.ensureRemoteFolder(reserved, parentId);
      } catch (error) {
        if (!isUniqueConstraint(error)) throw error;
        const winner = await this.prisma.driveFolder.findUnique({ where: { logicalKey: key } });
        if (winner) return this.ensureRemoteFolder(winner, parentId);
        // Another caller reserved this logical key or an ID collision occurred.
      }
    }
    throw new Error('Unable to reserve a unique Google Drive folder ID.');
  }

  private async ensureRemoteFolder(
    record: FolderRecord,
    expectedParentId: string,
  ): Promise<string> {
    if (record.parentDriveFileId !== expectedParentId) {
      throw new Error(`Drive folder mapping ${record.logicalKey} has a different parent.`);
    }
    const actual = await this.drive.getFolder(record.driveFileId);
    if (actual) {
      if (actual.parentId !== record.parentDriveFileId || actual.name !== record.name) {
        throw new Error(`Drive folder ${record.driveFileId} differs from its mapping.`);
      }
      return record.driveFileId;
    }

    const created = await this.drive.createFolder({
      id: record.driveFileId,
      name: record.name,
      parentId: record.parentDriveFileId,
    });
    if (
      created.id !== record.driveFileId ||
      created.parentId !== record.parentDriveFileId ||
      created.name !== record.name
    ) {
      throw new Error(`Drive folder ${record.driveFileId} differs from its mapping.`);
    }
    return record.driveFileId;
  }
}
