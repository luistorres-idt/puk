import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { DriveFolder } from './google-drive.client.js';
import { DriveFolderResolver, normalizeVin } from './drive-folder-resolver.js';

interface FolderRow {
  logicalKey: string;
  driveFileId: string;
  parentDriveFileId: string;
  name: string;
}

function harness() {
  const rows = new Map<string, FolderRow>();
  const remote = new Map<string, DriveFolder>();
  let nextId = 0;
  const drive = {
    generateId: vi.fn(async () => `folder-${++nextId}`),
    getFolder: vi.fn(async (id: string) => remote.get(id) ?? null),
    createFolder: vi.fn(async (folder: { id: string; name: string; parentId: string }) => {
      const existing = remote.get(folder.id);
      if (existing) return existing;
      const created = { ...folder };
      remote.set(folder.id, created);
      return created;
    }),
  };
  const prisma = {
    driveFolder: {
      findUnique: vi.fn(
        async ({ where }: { where: { logicalKey: string } }) => rows.get(where.logicalKey) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: FolderRow }) => {
        if (
          rows.has(data.logicalKey) ||
          [...rows.values()].some((row) => row.driveFileId === data.driveFileId)
        ) {
          throw Object.assign(new Error('Unique constraint'), { code: 'P2002' });
        }
        rows.set(data.logicalKey, data);
        return data;
      }),
    },
  };
  const resolver = new DriveFolderResolver(
    prisma as unknown as PrismaClient,
    drive,
    'shared-drive',
  );
  return { resolver, rows, remote, drive, prisma };
}

const client = {
  clientSheetId: 'client-1',
  clientNameSnapshot: 'Client One',
};

describe('DriveFolderResolver', () => {
  it('normalizes VIN with NFKC, trim, and uppercase; rejects empty values', () => {
    expect(normalizeVin('  ａｂｃ-１２３  ')).toBe('ABC-123');
    expect(() => normalizeVin('  ')).toThrow('serialNumber must not be empty');
  });

  it('creates client, VIN and folio folders with DB reservations before remote writes', async () => {
    const { resolver, rows, drive } = harness();
    drive.createFolder.mockImplementation(async (input) => {
      expect([...rows.values()].some((row) => row.driveFileId === input.id)).toBe(true);
      return { ...input };
    });
    const id = await resolver.ensureEvidenceFolder({
      ...client,
      serialNumber: ' vin-123 ',
      orderId: 'order-1',
      folio: 'OS-1',
    });
    expect(id).toBe('folder-3');
    expect([...rows.values()]).toEqual([
      {
        logicalKey: '["client","client-1"]',
        driveFileId: 'folder-1',
        parentDriveFileId: 'shared-drive',
        name: 'Client One',
      },
      {
        logicalKey: '["unit","client-1","VIN-123"]',
        driveFileId: 'folder-2',
        parentDriveFileId: 'folder-1',
        name: 'VIN-123',
      },
      {
        logicalKey: '["evidence-order","client-1","order-1","VIN-123"]',
        driveFileId: 'folder-3',
        parentDriveFileId: 'folder-2',
        name: 'OS-1',
      },
    ]);
  });

  it('reuses the VIN folder across orders and keeps evidence separate by folio', async () => {
    const { resolver, rows } = harness();
    const first = await resolver.ensureEvidenceFolder({
      ...client,
      serialNumber: 'vin-123',
      orderId: 'order-1',
      folio: 'OS-1',
    });
    const second = await resolver.ensureEvidenceFolder({
      ...client,
      serialNumber: ' VIN-123 ',
      orderId: 'order-2',
      folio: 'OS-2',
    });
    expect(first).not.toBe(second);
    expect(rows.size).toBe(4);
    expect([...rows.keys()].filter((key) => key.startsWith('["unit"'))).toHaveLength(1);
  });

  it('puts signature and report versions in one common folder for all units', async () => {
    const { resolver, rows } = harness();
    const first = await resolver.ensureSharedOrderFolder({
      ...client,
      orderId: 'order-1',
      folio: 'OS-1',
    });
    const again = await resolver.ensureSharedOrderFolder({
      ...client,
      clientNameSnapshot: 'Renamed Client',
      orderId: 'order-1',
      folio: 'OS-1',
    });
    expect(again).toBe(first);
    expect([...rows.values()].map((row) => row.name)).toEqual(['Client One', 'Órdenes', 'OS-1']);
  });

  it('does not merge two clients that share a visible name', async () => {
    const { resolver, rows } = harness();
    const first = await resolver.ensureSharedOrderFolder({
      ...client,
      orderId: 'order-1',
      folio: 'OS-1',
    });
    const second = await resolver.ensureSharedOrderFolder({
      ...client,
      clientSheetId: 'client-2',
      orderId: 'order-2',
      folio: 'OS-2',
    });
    expect(first).not.toBe(second);
    expect(rows.get('["client","client-1"]')?.driveFileId).not.toBe(
      rows.get('["client","client-2"]')?.driveFileId,
    );
  });

  it('recovers a failed remote create with the same reserved ID', async () => {
    const { resolver, rows, drive } = harness();
    drive.createFolder.mockRejectedValueOnce(new Error('Drive unavailable'));
    const input = { ...client, orderId: 'order-1', folio: 'OS-1' };
    await expect(resolver.ensureSharedOrderFolder(input)).rejects.toThrow('Drive unavailable');
    expect(rows.get('["client","client-1"]')?.driveFileId).toBe('folder-1');
    await expect(resolver.ensureSharedOrderFolder(input)).resolves.toBe('folder-3');
    expect(drive.createFolder).toHaveBeenNthCalledWith(2, {
      id: 'folder-1',
      name: 'Client One',
      parentId: 'shared-drive',
    });
  });

  it('lets a concurrent loser reload the winner after P2002', async () => {
    const { resolver, rows } = harness();
    const input = { ...client, orderId: 'order-1', folio: 'OS-1' };
    const [first, second] = await Promise.all([
      resolver.ensureSharedOrderFolder(input),
      resolver.ensureSharedOrderFolder(input),
    ]);
    expect(first).toBe(second);
    expect(rows.size).toBe(3);
  });

  it('rejects stale or foreign parent mappings instead of returning their IDs', async () => {
    const { resolver, rows, remote } = harness();
    const input = { ...client, orderId: 'order-1', folio: 'OS-1' };
    await resolver.ensureSharedOrderFolder(input);
    const orders = rows.get('["shared-orders","client-1"]')!;
    rows.set(orders.logicalKey, { ...orders, parentDriveFileId: 'another-client' });
    await expect(resolver.ensureSharedOrderFolder(input)).rejects.toThrow('different parent');
    rows.set(orders.logicalKey, orders);
    remote.set(orders.driveFileId, {
      id: orders.driveFileId,
      name: 'Wrong Name',
      parentId: orders.parentDriveFileId,
    });
    await expect(resolver.ensureSharedOrderFolder(input)).rejects.toThrow(
      'differs from its mapping',
    );
  });
});
